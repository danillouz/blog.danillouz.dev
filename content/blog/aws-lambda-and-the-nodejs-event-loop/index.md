---
title: AWS Lambda and the Node.js event loop
date: '2019-05-30T19:50:08.597Z'
description: 'Freezing and thawing the execution context can impact event loop behavior.'
---

One of the more suprising things I learned while working with serverless technologies is how AWS Lambda interacts with the Node.js event loop.

Lambda is powered by a <a href="https://aws.amazon.com/blogs/aws/firecracker-lightweight-virtualization-for-serverless-computing/" target="_blank">virtualization technology</a>. And to optimize performance it can "freeze" the execution context of your code. Later on the execution context can be "thawed" so it can be reused.

This will make your code run faster, but can impact the "expected" event loop behavior. We'll explore this in detail. But before we dive in, lets quickly refresh the Node.js concurrency model.

If you’re already familiar with the event loop and it’s mechanics, you can jump straight to the [AWS Lamba](#aws-lambda) section.

## Concurrency model

Node.js is _single threaded_ and the <a href="https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick" target="_blank">event loop</a> is the concurrency model that allows non-blocking I/O operations to be performed.

> The event loop is what allows Node.js to perform non-blocking I/O operations — despite the fact that JavaScript is single-threaded — by offloading operations to the system kernel whenever possible.

How? Well, we’ll have to discuss the call stack and the task queue first.

### Call stack

Function calls form a _stack of frames_, where each frame represents a single function call.

Every time a function is called, it's _pushed_ onto the stack (added) and when the function is done executing, it's _popped_ off the stack (removed).

The frames in a stack come off in _last-in-first-out_ (LIFO) order:

<figure>
  <img src="./img/call-stack.png" alt="Call stack with 2 frames.">
  <figcaption>A call stack with 2 frames.</figcaption>
</figure>

Each frame stores information about the invoked function. Like the arguments the function was called with and any variables defined inside the called function’s body.

When we execute the following code:

```js
'use strict';

function work() {
  console.log('do work');
}

function main() {
  console.log('main start');

  work();

  console.log('main end');
}

main();
```

We can visualize the call stack over time like this:

<figure>
  <img src="./img/call-stack-examples/1.png" alt="Call stack progression over time for steps 1, 2 and 3.">
  <figcaption>Call stack progression over time for steps 1, 2 and 3.</figcaption>
</figure>

1. When the script starts executing, the call stack is empty.

```js
// 2

'use strict';

function work() {
  console.log('do work');
}

function main() {
  console.log('main start');

  work();

  console.log('main end');
}

main(); // highlight-line
```

2. `main()` is called and pushed onto the call stack.

```js
// 3

'use strict';

function work() {
  console.log('do work');
}

function main() {
  console.log('main start'); // highlight-line

  work();

  console.log('main end');
}

main();
```

3. While executing `main`, `console.log('main start')` is called and pushed onto the call stack.

<figure>
  <img src="./img/call-stack-examples/2.png" alt="Call stack progression over time for steps 4, 5 and 6.">
  <figcaption>Call stack progression over time for steps 4, 5 and 6.</figcaption>
</figure>

4. `console.log` executes, logs `"main start"` and is popped off the call stack.

```js
// 5

'use strict';

function work() {
  console.log('do work');
}

function main() {
  console.log('main start');

  work(); // highlight-line

  console.log('main end');
}

main();
```

5. `main` continues executing, calls `work()` and is pushed onto the call stack.

```js
// 6

'use strict';

function work() {
  console.log('do work'); // highlight-line
}

function main() {
  console.log('main start');

  work();

  console.log('main end');
}

main();
```

6. While executing `work`, `console.log('work')` is called and pushed onto the call stack.

<figure>
  <img src="./img/call-stack-examples/3.png" alt="Call stack progression over time for steps 7, 8 and 9.">
  <figcaption>Call stack progression over time for steps 7, 8 and 9.</figcaption>
</figure>

7. `console.log executes`, logs `"do work"` and is popped off the call stack.

8. `work` finishes executing and is popped off the call stack.

```js
// 9

'use strict';

function work() {
  console.log('do work');
}

function main() {
  console.log('main start');

  work();

  console.log('main end'); // highlight-line
}

main();
```

9. `main` continues executing, calls `console.log('main end')` and is pushed onto the call stack.

<figure>
  <img src="./img/call-stack-examples/4.png" alt="Call stack progression over time for steps 10 and 11.">
  <figcaption>Call stack progression over time for steps 10 and 11.</figcaption>
</figure>

10. `console.log` executes, logs `"main end"` and is popped off the call stack.

11. `main` finishes executing and is popped off the stack. The call stack is empty again and the script finishes executing.

This code didn't interact with any asynchronous (internal) APIs. But when it does, like when calling `setTimeout(callback)`, it makes use of the task queue.

### Task queue

Any asynchronous work in the runtime is represented as a task in a queue, or in other words, a _message queue_.

Each message can be thought of as a function that will be called in _first-in-first-out_ (FIFO) order to handle said work. For example, the callback provided to the `setTimeout` or `Promise` API:

<figure>
  <img src="./img/queue.png" alt="A queue with 2 tasks (messages).">
  <figcaption>A queue with 2 tasks (messages).</figcaption>
</figure>

Additionally, each message is processed **completely** before any other message is processed. This means that whenever a function runs, _it can't be interrupted_. This behavior is called _run-to-completion_ and makes it easier to reason about our JavaScript programs.

Messages get _enqueued_ (added to the queue) and at some point messages will be _dequeued_ (removed from the queue). When? How? This is handled by the Event Loop.

### Event loop

The event loop can be literally thought of as a loop that runs indefinitely and where every cycle is referred to as a _tick_.

On every tick the event loop will check if there’s any work in the task queue. If there is, it will execute the task (function), **but only if the call stack is empty**.

The event loop can be described with the following pseudo code, taken from <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop#Event_loop" target="_blank">MDN</a>:

```js
while (queue.waitForMessage()) {
  queue.processNextMessage();
}
```

To summarize:

- When code executes, function calls are added to the call stack.
- Whenever calls are made via asynchronous (internal) APIs (like `setTimeout` or `Promise`) the corresponding callbacks are eventually added to the task queue.
- When the call stack is empty and the task queue contains one or more tasks, the event loop will remove a task on every tick and push it onto the call stack. The function will execute and this process will continue until all work is done.

<figure>
  <img src="./img/event-loop.png" alt="The event loop can be visualized as a queue of tasks, which are picked up by a loop. It executes said tasks by pushing them on the call stack. When a task executes, it can enqueue more tasks directly or by interacting with other (internal) APIs.">
  <figcaption>The event loop visualized.</figcaption>
</figure>

With that covered, we can explore how the AWS Lambda execution environment interacts with the Node.js event loop.

## AWS Lambda

AWS Lambda invokes a Lambda function via a _handler function_ that is exported, e.g. `exports.handler`. When Lambda invokes this handler it calls it with 3 arguments, i.e. `function handler(event, context, callback)`.

The `callback` argument may be used to return information to the caller and to signal that the handler function has completed, so Lambda may end it. For that reason you don’t have to call it explicitly. Meaning, if you don’t call it, Lambda will call it for you.

Additionally, when using Node.js version `8.10` or above, you may also return a `Promise` instead of using the callback function. In that case you can also use the `async` keyword, because `async` functions return a `Promise`.

### Baseline

From here on we’ll use a simple script as a "baseline" to reason about the event loop behavior. Create a file called `timeout.js` with the following contents:

```js
'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3);

  console.log('main end');
}

main();
```

When we execute this script locally with `node timeout.js` the following will print:

```
> main start
> timeout start
> main end
> timeout cb fired after 5000 ms
```

The fourth message takes 5 seconds to print, but the script does _not_ stop executing before it does.

### What happens in Lambda, stays in Lambda

Now lets modify the code from `timeout.js` so it's compatible with Lambda:

```js
'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3);

  console.log('main end');
}

exports.handler = main; // highlight-line
```

You can create a new function in the AWS Lambda console and paste in the code from above. Run it, sit back and enjoy:

<figure>
  <img src="./img/lambda-console/1.png" alt="Lambda console first run. The log message from the timeout callback is not printed.">
  <figcaption>Lambda console first run. The log message from the <code>timeout</code> callback is not printed.</figcaption>
</figure>

Wait, what? Lambda just ended the handler function _without_ printing the fourth message `"timeout cb fired after 5000 ms”`. Lets run it again:

<figure>
  <img src="./img/lambda-console/2.png" alt="Lambda console second run. The log message of the timeout callback from the previous run is printed first.">
  <figcaption>Lambda console second run. The log message of the <code>timeout</code> callback from the previous run is printed first.</figcaption>
</figure>

It now prints `"timeout cb fired after 5000 ms”` _first_ and then the other ones! So what’s going on here?

### AWS Lambda execution model

AWS Lambda takes care of provisioning and managing resources needed to run your functions. When a Lambda function is invoked, an execution context is created for you based on the configuration you provide.

The execution context is a temporary runtime environment that initializes any external dependencies of your Lambda function.

After a Lambda function is called, AWS Lambda maintains the execution context for some time in anticipation of another invocation of the Lambda function (for performance benefits). It "freezes" the execution context after a Lambda function completes and may choose to reuse ("thaw") the same execution context when the Lambda function is called again (but doesn’t have to).

In the <a href="https://docs.aws.amazon.com/lambda/latest/dg/running-lambda-code.html" target="_blank">AWS documentation</a> we can find the following regarding this subject:

> Background processes or callbacks initiated by your Lambda function that did not complete when the function ended resume **if AWS Lambda chooses to** reuse the Execution Context.

As well as this somewhat <a href="https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html" target="_blank">hidden message</a>:

> When the callback is called (explicitly or implicitly), AWS Lambda continues the Lambda function invocation until the event loop is empty.

Lets see if we can find some more information and search for <a href="https://www.google.com/search?q=lambda+callback+empty+event+loop&ie=utf-8&oe=utf-8" target="_blank">lambda + callback + empty + event loop</a>.

The top result is about the <a href="https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html" target="_blank">context object</a>. Looking through it we can find a property called `callbackWaitsForEmptyEventLoop`. This is what it does:

> The default value is `true`. This property is useful only to modify the default behavior of the callback. **By default, the callback will wait until the event loop is empty before freezing the process and returning the results to the caller**.

OK, so with this information we can make sense of what happened when we executed the code in `timeout.js` before (showed below for convenience).

Lets break it down and go over it step by step:

<figure>
  <img src="./img/lambda-break-down/1.png" alt="">
</figure>

1. Lambda starts executing the code in `timeout.js`. The call stack is empty.

```js
// 2

'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3);

  console.log('main end');
}

exports.handler = main; // highlight-line
```

<figure>
  <img src="./img/lambda-break-down/2.png" alt="">
</figure>

2. `main` is called and added to the call stack.

```js
// 3

'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start'); // highlight-line

  timeout(5e3);

  console.log('main end');
}

exports.handler = main;
```

<figure>
  <img src="./img/lambda-break-down/3.png" alt="">
</figure>

3. While executing `main`, `console.log('main start')` is called and pushed onto the call stack.

<figure>
  <img src="./img/lambda-break-down/4.png" alt="">
</figure>

4. `console.log` executes, logs `"main start"` and is popped off the call stack.

```js
// 5

'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3); // highlight-line

  console.log('main end');
}

exports.handler = main;
```

<figure>
  <img src="./img/lambda-break-down/5.png" alt="">
</figure>

5. `main` continues executing, calls `timeout(5e3)` and is pushed onto the call stack.

```js
// 6

'use strict';

function timeout(ms) {
  console.log('timeout start'); // highlight-line

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3);

  console.log('main end');
}

exports.handler = main;
```

<figure>
  <img src="./img/lambda-break-down/6.png" alt="">
</figure>

6. While executing `timeout`, `console.log('timeout start')` is called and pushed onto the call stack.

<figure>
  <img src="./img/lambda-break-down/7.png" alt="">
</figure>

7. `console.log` executes, logs `"timeout start"` and is popped off the call stack.

```js
// 8

'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => { // highlight-line
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3);

  console.log('main end');
}

exports.handler = main;
```

<figure>
  <img src="./img/lambda-break-down/8.png" alt="">
</figure>

8. `timeout` continues executing, calls `new Promise(callback)` and is pushed onto the call stack.

<figure>
  <img src="./img/lambda-break-down/9.png" alt="">
</figure>

9. While `new Promise(callback)` executes, it interacts with the `Promise` API and passes the provided callback to it. The `Promise` API sends the callback to the task queue and now must wait until the call stack is empty before it can execute.

<figure>
  <img src="./img/lambda-break-down/10.png" alt="">
</figure>

10. `new Promise` finishes executing and is popped of the call stack.

<figure>
  <img src="./img/lambda-break-down/11.png" alt="">
</figure>

11. `timeout` finishes executing and is popped off the call stack.

```js
// 12

'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3);

  console.log('main end'); // highlight-line
}

exports.handler = main;
```

<figure>
  <img src="./img/lambda-break-down/12.png" alt="">
</figure>

12. `main` continues executing, calls `console.log('main end')` and is pushed onto the call stack.

<figure>
  <img src="./img/lambda-break-down/13.png" alt="">
</figure>

13. `console.log` executes, logs `"main end"` and is popped off the call stack.

<figure>
  <img src="./img/lambda-break-down/14.png" alt="">
</figure>

14. `main` finishes executing and is popped off the call stack. The call stack is empty.

<figure>
  <img src="./img/lambda-break-down/15.png" alt="">
</figure>

15. The `Promise` callback (step 9) can now be scheduled by the event loop and is pushed onto the call stack.

```js
// 16

'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => { // highlight-line
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  timeout(5e3);

  console.log('main end');
}

exports.handler = main;
```

<figure>
  <img src="./img/lambda-break-down/16.png" alt="">
</figure>

16. The `Promise` callback executes, calls `setTimeout(callback, timeout)` and is pushed onto the call stack.

<figure>
  <img src="./img/lambda-break-down/17.png" alt="">
</figure>

17. While `setTimeout(callback, timeout)` executes, it interacts with the `setTimeout` API and passes the corresponding callback and timeout to it.

<figure>
  <img src="./img/lambda-break-down/18.png" alt="">
</figure>

18. `setTimeout(callback, timeout)` finishes executing and is popped of the stack. At the same time the `setTimeout` API starts counting down the timeout, to schedule the callback function in the future.

<figure>
  <img src="./img/lambda-break-down/19.png" alt="">
</figure>

19. The Promise callback finishes executing and is popped off the stack. The call stack is empty again.

At this point the call stack and task queue are both empty. At the same time a timeout is counting down (5 seconds), but the corresponding timeout callback has _not_ been scheduled yet. As far as Lambda is concerned, the event loop is empty, it will _freeze_ the process and return results to the caller!

The interesting part is that Lambda doesn’t immediately destroy it’s execution context. Because if we wait for +5 seconds and run the Lambda again, like we did in the [second run](#what-happens-in-lambda-stays-in-lambda). We see the console message printed from the `setTimeout` callback first.

In other words. This happens because after the Lambda stopped executing (first run), the execution context was still around. And after waiting for +5 seconds, the `setTimeout` API sent the corresponding callback to the task queue:

<figure>
  <img src="./img/lambda-break-down/exec-context-1.png" alt="The setTimeout callback is sent to the task queue after 5 seconds.">
  <figcaption>The <code>setTimeout</code> callback is sent to the task queue after 5 seconds.</figcaption>
</figure>

When we execute the Lambda again (second run), the call stack is empty with a message in the task queue, which can immediately be scheduled by the event loop:

<figure>
  <img src="./img/lambda-break-down/exec-context-2.png" alt="The setTimeout callback is scheduled by the event loop.">
  <figcaption>The <code>setTimeout</code> callback is scheduled by the event loop.</figcaption>
</figure>

This results in `"timeout cb fired after 5000 ms"` being printed first, because it executed before any of the code in our Lambda function:

<figure>
  <img src="./img/lambda-break-down/exec-context-3.png" alt="The setTimeout callback is executed before any other code in the Lambda.">
  <figcaption>The <code>setTimeout</code> callback is executed before any other code in the Lambda.</figcaption>
</figure>

### Doing it right

Obviously this is undesired behavior and you should **not** write your code in the same way we wrote the code in `timeout.js`.

Like stated in the <a href="https://docs.aws.amazon.com/lambda/latest/dg/running-lambda-code.html" target="_blank">AWS documentation</a>, we need to make sure to complete processing _all_ callbacks before our handler exits:

> You should make sure any background processes or callbacks (in case of Node.js) in your code are complete before the code exits.

Therefore we’ll make the following change to the code in `timeout.js`:

```
- timeout(5e3);
+ await timeout(5e3);
```

This change makes sure the handler function does _not_ stop executing until the `timeout` function finishes:

```js
'use strict';

function timeout(ms) {
  console.log('timeout start');

  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`timeout cb fired after ${ms} ms`);
      resolve();
    }, ms);
  });
}

async function main() {
  console.log('main start');

  await timeout(5e3); // highlight-line

  console.log('main end');
}

exports.handler = main;
```

When we run our code with this change, all is well:

<figure>
  <img src="./img/lambda-console/3.png" alt="Lambda console third run. Awaiting the timeout prints the log messages in expected order.">
  <figcaption>Lambda console third run. Awaiting the <code>timeout</code> prints the log messages in expected order.</figcaption>
</figure>

## In closing

I intentionally left out some details about the the task queue. There are actually _two_ task queues! One for _macrotasks_ (e.g. `setTimeout`) and one for _microtasks_ (e.g. `Promise`).

According to the <a href="https://html.spec.whatwg.org/multipage/webappapis.html#task-queue" target="_blank">spec</a>, one macrotask should get processed per tick. After it finishes, all microtasks will be processed within the same tick. While these microtasks are processed they can queue more microtasks, **which will all be run in the same tick**.

For more information see <a href="https://blog.risingstack.com/node-js-at-scale-understanding-node-js-event-loop" target="_blank">this article from RisingStack</a> where they go more into detail. I highly recommend you read it.

Originally published on <a href="https://medium.com/radient-tech-blog/aws-lambda-and-the-node-js-event-loop-864e48fba49" target="_blank">Medium</a>.
