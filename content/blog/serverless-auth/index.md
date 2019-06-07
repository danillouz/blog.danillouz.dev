---
title: Serverless Auth
date: '2019-06-07T17:03:43.227Z'
description: 'How to protect AWS API Gateway endpoints with Lambda and Auth0.'
---

Authentication (authN) and authorization (authZ) are complicated. It can be difficult to reason about, and to work with. The terminology in this domain can be complex as well. Sometimes terms are used interchangeably or can be ambiguous. Like saying "auth" to refer to both authentication (who are you?) and authorization (I know who you are, but what are you allowed to do?).

On top of that, it can also be challenging to know when to use what. Depending on what we're building and for whom, different auth protocols and strategies might be more suitable or required.

I won't be covering these protocols and strategies in depth. Instead, I want to show you that implementing something as complex as auth can be quite simple. In order to do that, I'll focus on a specific auth use case. And show you how it can be implemented, using a specific set of (serverless) technologies.

## Use case and technologies

> How can we secure an HTTP API with a token based auth strategy. So that only authenticated- and authorized web clients can access it on behalf of the user?

Or in other words. How can we make sure that only users logged into a web client, can successfully communicate with an API over HTTP.

More specifically:

- The HTTP API is an <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" target="_blank" rel="noopener noreferrer">AWS API Gateway</a> (APIG).
- The endpoints of the API are <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html" target="_blank" rel="noopener noreferrer">Lambda Proxy Integrations</a> (i.e. Lambda handlers).
- The web client is a <a href="https://en.wikipedia.org/wiki/Single-page_application" target="_blank" rel="noopener noreferrer">Single Page Application</a> (SPA) built with <a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">React</a>.

Additionally, I'll be using <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a> as the third party auth provider, to help with some of the heavy lifting.

## Why use a third party auth provider?

Before we dive in, I think it's important to explain the motivation behind this decision.

In order to secure our API we can use:

- <a href="https://oauth.net/2/" target="_blank" rel="noopener noreferrer">OAuth 2.0</a>: an authZ protocol.

- <a href="https://openid.net/connect/" target="_blank" rel="noopener noreferrer">OpenID Connect (OIDC)</a>: an authN protocol (a simple identity layer built on top of OAuth 2.0).

- <a href="https://auth0.com/learn/token-based-authentication-made-easy/" target="_blank" rel="noopener noreferrer">Token based auth</a>: a strategy that allows clients (like a SPA) to send "auth information" to a protected API, and make requests on behalf of a user (e.g. sending a <a href="https://oauth.net/2/bearer-tokens/" target="_blank" rel="noopener noreferrer">Bearer Token</a> via an HTTP request header).

Now, you could choose to implement this yourself. Meaning, you could build your own "auth server". But I think that (in most cases) you should _not_ do this.

Why not? Because it will require _all your focus_ to build, operate and maintain a secure, reliable, performant and usable auth server. Or in other words, it will cost you (and your team) a _lot_ of time, energy and money. And even if you do manage to build it, the result can be poor. There will be bugs, edge cases you didn't think off and you might even implement (parts of) the spec incorrectly (auth is complicated, remember?).

If you do have a valid use case to build your own auth server, tread carefully. **A poor implementation will lead to a bad user experience and is also dangerous, because it can compromise your users and organization.**

What should you do then? In my opinion, use a third party auth provider like <a href="https://aws.amazon.com/cognito/" target="_blank" rel="noopener noreferrer">Cognito</a> or <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a>. They give you all the fancy tooling and scalable infrastructure you'll need. Sure, you'll have to pay for it, but the price is very fair. And it will most likely be a small fraction of what it would cost you when you'd roll your own solution.

Another great (but often overlooked) benefit of choosing _buy over build_, is that you'll also get access to the domain expert's knowledge. Or in other words, they can help you choose and advise on the best auth strategy for you use case. And there's usually also a community you can turn to for help as well.

And last but not least. Because you're leaving the complexities and challenges of auth to the experts. You can focus on building and operating _your own_ apps and services again!

However, I do recommend you build an auth service yourself for learning purposes. I think it's quite "fun" and challenging. Most importantly, it will give you a deeper understanding of the subject. Which will be _very_ helpfull when navigating the "documentation jungle" of your favorite auth provider.

Okay, with that out of the way, lets get started!

## The API

I'll be using <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">Serverless Framework</a> in the code examples.
