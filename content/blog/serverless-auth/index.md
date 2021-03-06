---
title: Serverless Auth
date: '2019-06-19T14:42:41.064Z'
description: 'How to protect AWS API Gateway endpoints with AWS Lambda and Auth0.'
---

Auth is complicated--it can be difficult to reason about and can be hard to work with. The terminology can be complex as well and terms are sometimes used interchangeably or can be ambiguous. Like saying "auth" to refer to both authentication (who are you?) and authorization (I know who you are, but what are you allowed to do?).

On top of that, it can also be challenging to know when to use what. Depending on what you're building and for whom, different auth protocols and strategies might be more suitable or required.

In this post I won't be exploring these protocols and strategies in depth. Instead, I want to show you that implementing something as complex as auth doesn't have to be difficult. In order to do that, I'll focus on a specific (but common) use case and show you a way to implement it--using a specific set of technologies.

### Table of contents

- [Use case and technologies](#use-case-and-technologies)
- [Why use a third party auth provider?](#why-use-a-third-party-auth-provider)
- [What will we build?](#what-will-we-build)
- [Registering the API with Auth0](#registering-the-api-with-auth0)
- [What’s a Lambda Authorizer?](#whats-a-lambda-authorizer)
- [Solidifying our mental model](#solidifying-our-mental-model)
- [Implementing the Lambda Authorizer](#implementing-the-lambda-authorizer)
- [Implementing the Account API](#implementing-the-account-api)
- [CORS headers](#cors-headers)
- [In closing](#in-closing)

If you just want to read the code, go to <a href="https://github.com/danillouz/serverless-auth" target="_blank" rel="noopener noreferrer">github.com/danillouz/serverless-auth</a>.

## Use case and technologies

> How can we secure an HTTP API with a token based authentication strategy, so only authenticated- and authorized clients can access it?

More specifically:

- The HTTP API is an <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" target="_blank" rel="noopener noreferrer">AWS API Gateway</a> (APIG).
- The API endpoints are protected with a <a href="https://oauth.net/2/bearer-tokens/" target="_blank" rel="noopener noreferrer">bearer token</a> and implemented as <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html" target="_blank" rel="noopener noreferrer">Lambda Proxy Integrations</a> (i.e. Lambda handlers).
- <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a> is used as a third party auth provider.
- An <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html" target="_blank" rel="noopener noreferrer">APIG Lambda Authorizer</a> is used to verify the token with Auth0.
- The Lambdas are implemented using <a href="https://nodejs.org/en/" target="_blank" rel="noopener noreferrer">Node.js</a> and the <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">Serverless Framework</a>.
- <a href="https://en.wikipedia.org/wiki/CURL" target="_blank" rel="noopener noreferrer">cURL</a> (`curl`) is used as a "client" to send HTTP requests to the API with a token.

## Why use a third party auth provider?

I mentioned that I'll be using Auth0 as a third party auth provider. This means that I'm choosing _not_ to build (nor operate!) my own "auth server". So before we get started, I think it's important to explain the motivation behind this decision.

In order to build an auth server you could use:

- <a href="https://oauth.net/2/" target="_blank" rel="noopener noreferrer">OAuth 2.0</a>: an authorization protocol.

- <a href="https://openid.net/connect/" target="_blank" rel="noopener noreferrer">OpenID Connect (OIDC)</a>: an authentication protocol. This is an "identity layer" built on top of OAuth 2.0.

- <a href="https://auth0.com/learn/token-based-authentication-made-easy/" target="_blank" rel="noopener noreferrer">Token based authentication</a>: a strategy that requires a client to send a signed bearer token when making requests to a protected API. The API will only respond to requests successfully when it receives a verified token.

- <a href="https://tools.ietf.org/html/rfc7519" target="_blank" rel="noopener noreferrer">JSON Web Tokens (JWTs)</a>: a way to send auth information (i.e. "claims") as JSON. A JWT contains a "Header", "Payload" and "Signature" which are Base64 encoded and "dot" separated. In effect, a JWT can be used as a bearer token. You can see how a JWT looks like by visiting <a href="https://jwt.io/" target="_blank" rel="noopener noreferrer">jwt.io</a>.

And with perhaps the help of some other tools/libraries, you might be confident enough to build an auth server yourself. But I think that (in most cases) you shouldn't go down this route. Why not? Because it will cost you and your team a _lot_ of time, energy and money to build, operate and maintain it.

And even if you do manage to build it, the result can be poor. There will be bugs, and edge cases you didn't think of. But because auth is a nontrivial problem to solve, you might even implement (parts of) the spec incorrectly.

If you do have a valid use case, plus enough resources and knowledge to build your own auth server, tread carefully. **A poor implementation will lead to a bad user experience and is also dangerous, because it can compromise your users and organization.**

What should you do then? In my opinion, use a third party auth provider like <a href="https://aws.amazon.com/cognito/" target="_blank" rel="noopener noreferrer">Cognito</a> or Auth0. They give you all the fancy tooling, scalable infrastructure and resources you will need to provide a _secure_, _reliable_, _performant_ and _usable_ solution. Sure, you'll have to pay for it, but the pricing is _very_ fair. And it will most likely be a small fraction of what it would cost you when you'd roll your own solution.

Another (sometimes overlooked) benefit of choosing _buy over build_, is that you'll get access to the domain expert's _knowledge_. Where they can advise and help you choose the best auth strategy for your use case. And last but not least--leaving the complexities and challenges of auth to the experts, gives you the ability to _focus_ on your own things again!

However, I do recommend you build an auth service yourself for learning purposes. I think it's quite fun and challenging. And more importantly, you'll get a deeper understanding of the subject--which will be _very_ helpful when you're navigating the "documentation jungle" of your favorite auth provider.

Okay, let's get started!

## What will we build?

We'll build an Account API with a single endpoint that returns some profile data.

Requirements and constraints are:

- The endpoint will be `GET /profile`.
- The business logic of the endpoint will be implemented by a Lambda handler:
  - The Lambda will return data as JSON.
  - The Lambda will return a single property `name` with value `Daniël`.
  - The Lambda will return HTTP status code `200`.
- The endpoint will require a bearer token to return the profile data.
  - The token will be sent via the `Authorization` request header.
  - The `Authorization` request header value must have the format: `Bearer TOKEN`.
  - The token is verified by a Lambda Authorizer with the help of Auth0.

This API isn't very useful, but gives us something to work with in order to implement auth.

### Example

Request:

```
HTTP GET /profile
Authorization: Bearer eyJ...lKw
```

Response:

```
HTTP 200 OK
Content-Type: application/json
```

```json
{
  "name": "Daniël"
}
```

## Registering the API with Auth0

When the Account API receives a request with the bearer token, it will have to verify the token with the help of Auth0. In order to do that, we first have to register our API with them:

1. <a href="https://auth0.com/signup" target="_blank" rel="noopener noreferrer">Signup</a> and setup your tenant.
2. In the Auth0 dashboard, navigate to "APIs" and click on "Create API".
3. Follow the <a href="https://auth0.com/docs/apis" target="_blank" rel="noopener noreferrer">instructions</a> and provide a "Name" and "Identifier". For example `Account API` and `https://api.danillouz.dev/account`.
4. Use `RS256` as the signing algorithm (more on that later).
5. Click on "Create".

<figure>
  <img src="./img/auth0/register.png" alt="Image of the Auth0 API registration form.">
  <figcaption>Register you API with Auth0 by providing a name, identifier and signing algorithm.</figcaption>
</figure>

### Lambda Authorizer configuration

Now that our API is registered, we need to take note of the following (public) properties, to later on configure our Lambda Authorizer:

- Token issuer: this is basically your Auth0 tenant. It always has the format `https://TENANT_NAME.REGION.auth0.com`. For example `https://danillouz.eu.auth0.com/`.
- JWKS URI: this returns a <a href="https://auth0.com/docs/jwks" target="_blank" rel="noopener noreferrer">JSON Web Key Set (JWKS)</a>. The URI will be used by the Lambda Authorizer to fetch a public key from Auth0 and verify a token (more on that later). It always has the format `https://TENANT_NAME.REGION.auth0.com/.well-known/jwks.json`. For example `https://danillouz.eu.auth0.com/.well-known/jwks.json`.
- Audience: this is the "Identifier" you provided during registration (step 3). For example `https://api.danillouz.dev/account`. Note that this doesn't have to be a "real" endpoint.

You can also find these values under the "Quick Start" tab of the API details screen (you were redirected there after registering the API). For example, click on the "Node.js" tab and look for these properties:

- `issuer`
- `jwksUri`
- `audience`

<figure>
  <img src="./img/auth0/quick-start.png" alt="Image of the Auth0 Node.js quick start.">
  <figcaption>Find your public auth properties.</figcaption>
</figure>

## What's a Lambda Authorizer?

I haven't explained what a Lambda Authorizer is yet. In short, it's a feature of APIG to control access to an API. The AWS <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html" target="_blank" rel="noopener noreferrer">docs</a> say:

> A Lambda authorizer is useful if you want to implement a custom authorization scheme that uses a bearer token authentication strategy such as OAuth...

There are actually two types of Lambda Authorizers:

1. Token based-authorizers.
2. Request parameter-based authorizers.

And we'll be using the token-based one, because it supports bearer tokens.

### What should it do?

When a client makes a request to APIG, AWS will invoke the Lambda Authorizer _first_ (if one is configured). The Lambda Authorizer must then extract the bearer token from the `Authorization` request header and validate it by:

1. Fetching the JWKS (which contains the public key) from Auth0 using the JWKS URI.
2. Verifying the token signature with the fetched public key.
3. Verifying the token has the correct issuer and audience claims.

> We get the JWKS URI, issuer and audience values after [registering the API with Auth0](#lambda-authorizer-configuration).

Only when the token passes these checks, should the Lambda Authorizer output an <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html" target="_blank" rel="noopener noreferrer">IAM Policy</a> document with `Effect` set to `Allow`:

```js
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "execute-api:Invoke",
      "Effect": "Allow", // highlight-line
      "Resource": "ARN_OF_LAMBDA_HANDLER"
    }
  ]
}
```

It's this policy that tells APIG it's _allowed_ to invoke our downstream Lambda handler--in our case, that will be the Lambda handler that returns the profile data.

Alternatively, the Lambda authorizer may _deny_ invoking the downstream handler by setting `Effect` to `Deny`:

```js
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "execute-api:Invoke",
      "Effect": "Deny", // highlight-line
      "Resource": "ARN_OF_LAMBDA_HANDLER"
    }
  ]
}
```

This will make APIG respond with `403 Forbidden`. To make APIG respond with `401 Unauthorized`, return an `Unauthorized` error from the Lambda Authorizer. We'll see this in action when implementing the Lambda Authorizer.

### A note on authorization

I found it good practice to only _authenticate_ the caller from the Lambda Authorizer and apply _authorization_ logic _downstream_.

This may not be feasible in all use cases, but doing this keeps the Lambda Authorizer _simple_. Because it will only be responsible for:

- Verifying the token.
- Propagating authorization information downstream.

The downstream Lambda handler will then use the authorization information to decide if it should execute its "business logic" for the specific caller.

Following this design also leads to a nice "decoupling" between the authentication- and authorization logic, i.e. between the Lambda Authorizer and Lambda handler(s).

#### Scopes

When using OAuth 2.0, scopes can be used to apply authorization logic. In our case we could have a `get:profile` scope. And a Lambda handler can check if the caller has been authorized to perform the action that is represented by the scope. If the scope is not present, the Lambda handler can return a `403 Forbidden` response back to the caller.

You can configure scope in the Auth0 dashboard by adding _permissions_ to the registered API. Navigate to the "Permissions" tab of the API details screen and add `get:profile` as a scope:

<figure>
  <img src="./img/auth0/api-permissions.png" alt="Image of the Auth0 API permissions tab.">
  <figcaption>Use Auth0 to add scopes to the Account API.</figcaption>
</figure>

We'll use this scope when implementing the Account API. And you can read more about scopes in the Auth0 <a href="https://auth0.com/docs/scopes/current" target="_blank" rel="noopener noreferrer">docs</a>.

#### Context

You can propagate authorization information (like scopes) downstream, by returning a `context` object in the Lambda Authorizer's response:

```js
'use strict';

module.exports.authorizer = event => {
  const authResponse = {
    principalId: 'UNIQUE_ID',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: event.methodArn
        }
      ]
    },
    // highlight-start
    context: {
      scope: 'get:profile'
    }
    // highlight-end
  };

  return authResponse;
};
```

But there's a caveat here--you can _not_ set a JSON serializable object or array as a valid value of any key in the `context` object. It can only be a `String`, `Number` or `Boolean`:

```js
context: {
  a: 'value', // OK
  b: 1, // OK
  c: true, // OK
  d: [9, 8, 7], // Will NOT be serialized
  e: { x: 'value', y: 99, z: false } // Will NOT be serialized
}
```

Any "valid" properties passed to the `context` object will be made available to downstream Lambda handlers via the `event` object:

```js
'use strict';

module.exports.handler = event => {
  const { authorizer } = event.requestContext;
  console.log('scope: ', authorizer.scope); // "get:profile"
};
```

## Solidifying our mental model

With that covered, we're ready to build the Lambda Authorizer and the Account API. But before we do, let's take a step back and solidify our mental model first.

To summarize, we need the following components to protect our API:

- Auth0 as the third party auth provider to issue- and help verify bearer tokens.
- AWS APIG to represent the Account API.
- A Lambda Authorizer to verify tokens with Auth0.
- A Lambda handler for the `GET /profile` endpoint to return the profile data.
- `curl` as the client to send HTTP requests to the API with a token.

We can visualize how these components will interact with each other like this:

<figure>
  <img src="./img/auth-flow.png" alt="Image that shows an auth flow diagram.">
  <figcaption>The auth flow visualized.</figcaption>
</figure>

<ol>
  <li><code class="language-text">curl</code> will send an HTTP request to the <code class="language-text">GET /profile</code> endpoint with a token via the <code class="language-text">Authorization</code> request header.</li>

  <li>When the HTTP request reaches APIG, it will check if a Lambda Authorizer is configured for the called endpoint. If so, APIG will invoke the Lambda Authorizer.</li>

  <li>The Lambda Authorizer will then:
    <ul>
      <li>Extract the token from the <code class="language-text">Authorization</code> request header.</li>
      <li>Fetch the JWKS (which contains the public key) from Auth0.</li>
      <li>Verify the token signature with the fetched public key.</li>
      <li>Verify the token has the correct issuer and audience claims.</li>
    </ul>
  </li>

  <li>If the token is verified, the Lambda Authorizer will return an IAM Policy document with <code class="language-text">Effect</code> set to <code class="language-text">Allow</code>.</li>

  <li>APIG will now evaluate the IAM Policy and if the <code class="language-text">Effect</code> is set to <code class="language-text">Allow</code>, it will invoke the specified Lambda handler.
  </li>

  <li>The Lambda handler will execute and when the <code class="language-text">get:profile</code> scope is present, it will return the profile data back to the client.</li>
</ol>

Great, now the easy part, writing the code!

## Implementing the Lambda Authorizer

We'll do this by:

1. [Setting up the project](#1-setting-up-the-project)
2. [Configuring a Serverless manifest](#2-configuring-a-serverless-manifest)
3. [Defining the Lambda Authorizer](#3-defining-the-lambda-authorizer)
4. [Getting the token](#4-getting-the-token)
5. [Verifying the token](#5-verifying-the-token)
6. [Creating the auth response](#6-creating-the-auth-response)
7. [Releasing the Lambda Authorizer](#7-releasing-the-lambda-authorizer)

### 1. Setting up the project

Create a new directory for the code:

```shell
mkdir lambda-authorizers
```

Move to this directory and initialize a new <a href="https://www.npmjs.com/" target="_blank" rel="noopener noreferrer">npm</a> project with:

```shell
npm init -y
```

This creates a `package.json` file:

```shell
lambda-authorizers
  └── package.json # highlight-line
```

Now install the following required npm dependencies:

```shell
npm i jsonwebtoken jwks-rsa
```

The <a href="https://github.com/auth0/node-jsonwebtoken" target="_blank" rel="noopener noreferrer">jsonwebtoken</a> library will help use decode the bearer token (JWT) and verify its signature, issuer and audience claims. The <a href="https://github.com/auth0/node-jwks-rsa" target="_blank" rel="noopener noreferrer">jwks-rsa</a> library will help us fetch the JWKS from Auth0.

We'll use the Serverless Framework to configure and upload the Lambda to AWS, so install it as a "dev" dependency:

```shell
npm i -D serverless
```

### 2. Configuring a Serverless manifest

Create a `serverless.yaml` manifest file:

```shell
lambda-authorizers
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  └── serverless.yaml # highlight-line
```

Add the following content to it:

```yaml
service: lambda-authorizers

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src
```

Add the properties we got after [registering the API with Auth0](#lambda-authorizer-configuration) as environment variables. For example:

```yaml
service: lambda-authorizers

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3
  # highlight-start
  environment:
    JWKS_URI: 'https://danillouz.eu.auth0.com/.well-known/jwks.json'
    TOKEN_ISSUER: 'https://danillouz.eu.auth0.com/'
    AUDIENCE: 'https://api.danillouz.dev/account'
  # highlight-end

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src
```

And add the Lambda function definition:

```yaml
service: lambda-authorizers

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3
  environment:
    JWKS_URI: 'https://danillouz.eu.auth0.com/.well-known/jwks.json'
    TOKEN_ISSUER: 'https://danillouz.eu.auth0.com/'
    AUDIENCE: 'https://api.danillouz.dev/account'

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

# highlight-start
functions:
  auth0VerifyBearer:
    handler: src/auth0.verifyBearer
    description: Verifies the bearer token with the help of Auth0
# highlight-end
```

That's it for the Serverless manifest. You can find more information about it in the Serverless <a href="https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/" target="_blank" rel="noopener noreferrer">docs</a>.

### 3. Defining the Lambda Authorizer

In order to match the Lambda function definition in the Serverless manifest, create a file named `auth0.js` in `src`:

```shell
lambda-authorizers
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  ├── serverless.yaml
  └── src
      └── auth0.js # highlight-line
```

And in `src/auth0.js` export a method named `verifyBearer`:

```js
'use strict';

module.exports.verifyBearer = async () => {
  try {
    // Lambda Authorizer implementation goes here
  } catch (err) {
    console.log('Authorizer Error: ', err);

    throw new Error('Unauthorized');
  }
};
```

If something goes "wrong" in the Lambda, we'll log the error and throw a new `Unauthorized` error. This will make APIG return a `401 Unauthorized` response back to the caller. Note that the thrown error _must_ match the string `'Unauthorized'` _exactly_ for this to work.

### 4. Getting the token

The Lambda will first have to get the bearer token from the `Authorization` request header. Create a helper function for that in `src/get-token.js`:

```shell
lambda-authorizers
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  ├── serverless.yaml
  └── src
      ├── auth0.js
      └── get-token.js # highlight-line
```

And in this file export a function named `getToken`:

```js
'use strict';

module.exports = function getToken(event) {
  if (event.type !== 'TOKEN') {
    throw new Error('Authorizer must be of type "TOKEN"');
  }

  const { authorizationToken: bearer } = event;
  if (!bearer) {
    throw new Error(
      'Authorization header with "Bearer TOKEN" must be provided'
    );
  }

  const [, token] = bearer.match(/^Bearer (.*)$/) || [];
  if (!token) {
    throw new Error('Invalid bearer token');
  }

  return token;
};
```

Here we're only interested in `TOKEN` events because we're implementing a [token-based authorizer](#whats-a-lambda-authorizer). And we can access the value of the `Authorization` request header via the `event.authorizationToken` property.

Then `require` and call the helper in the Lambda with the APIG HTTP input <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format" target="_blank" rel="noopener noreferrer">event</a> as an argument:

```js
'use strict';

const getToken = require('./get-token'); // highlight-line

// highlight-start
module.exports.verifyBearer = async event => {
  // highlight-end
  try {
    const token = getToken(event); // highlight-line
  } catch (err) {
    console.log('Authorizer Error: ', err);

    throw new Error('Unauthorized');
  }
};
```

### 5. Verifying the token

Now we have the token, we need to verify it. We'll use another helper function for that in `src/verify-token.js`:

```shell
lambda-authorizers
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  ├── serverless.yaml
  └── src
      ├── auth0.js
      ├── get-token.js
      └── verify-token.js # highlight-line
```

This helper will do 3 things:

1. Decode the bearer token (JWT).
2. Fetch the public key from Auth0 using the JWKS URI (used to verify the token signature).
3. Verify the token signature, issuer and audience claims.

Export a function named `verifyToken` in `src/verify-token.js`:

```js
'use strict';

module.exports = async function verifyToken(
  token,
  decodeJwt,
  getSigningKey,
  verifyJwt,
  issuer,
  audience
) {
  // Step 1
  const decoded = decodeJwt(token, { complete: true });

  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('Invalid JWT');
  }

  // Step 2
  const { publicKey, rsaPublicKey } = await getSigningKey(decoded.header.kid);
  const signingKey = publicKey || rsaPublicKey;

  // Step 3
  return verifyJwt(token, signingKey, {
    issuer,
    audience
  });
};
```

After we decode the token with the option `{ complete: true }`, we can access the JWT `header` data. And using the <a href="https://community.auth0.com/t/what-is-the-origin-of-the-kid-claim-in-the-jwt/8431" target="_blank" rel="noopener noreferrer">kid</a> JWT claim, we can find out which key was used to sign the token.

When we registered the API with Auth0 we chose the `RS256` signing algorithm. This algorithm generates an asymmetric signature. Which basically means that Auth0 uses a _private key_ to sign a JWT when it issues one. And we can use a _public key_ (fetched with the JWKS URI) to verify the authenticity of the token.

First require the helper in the Lambda and pass the `token` as the first argument when calling it:

```js
'use strict';

const getToken = require('./get-token');
const verifyToken = require('./verify-token'); // highlight-line

module.exports.verifyBearer = async event => {
  try {
    const token = getToken(event);
    const verifiedData = await verifyToken(
      token // highlight-line
    );
  } catch (err) {
    console.log('Authorizer Error: ', err);

    throw new Error('Unauthorized');
  }
};
```

To decode the token in the helper (step 1), we'll use the `jsonwebtoken` library. It exposes a `decode` method. Pass this method as the second argument when calling the helper:

```js
'use strict';

const jwt = require('jsonwebtoken'); // highlight-line

const getToken = require('./get-token');
const verifyToken = require('./verify-token');

module.exports.verifyBearer = async event => {
  try {
    const token = getToken(event);
    const verifiedData = await verifyToken(
      token,
      jwt.decode // highlight-line
    );
  } catch (err) {
    console.log('Authorizer Error: ', err);

    throw new Error('Unauthorized');
  }
};
```

To fetch the public key from Auth0 (step 2) we'll use the `jwks-rsa` library. It exposes a client with `getSigningKey` method to fetch the key. Pas a "promisified" version of this method as the third argument when calling the helper:

```js
'use strict';

const util = require('util'); // highlight-line

const jwt = require('jsonwebtoken');
const jwksRSA = require('jwks-rsa'); // highlight-line

const getToken = require('./get-token');
const verifyToken = require('./verify-token');

const { JWKS_URI } = process.env; // highlight-line

// highlight-start
const jwksClient = jwksRSA({
  cache: true,
  rateLimit: true,
  jwksUri: JWKS_URI
});
const getSigningKey = util.promisify(jwksClient.getSigningKey);
// highlight-end

module.exports.verifyBearer = async event => {
  try {
    const token = getToken(event);
    const verifiedData = await verifyToken(
      token,
      jwt.decode,
      getSigningKey // highlight-line
    );
  } catch (err) {
    console.log('Authorizer Error: ', err);

    throw new Error('Unauthorized');
  }
};
```

Finally, to verify the token signature, issuer and audience claims (step 3) we'll use the `jsonwebtoken` library again. It exposes a `verify` method. Pass a "promisified" version of this method together with the `TOKEN_ISSUER` and `AUDIENCE` as the final arguments when calling the helper:

```js
'use strict';

const util = require('util');

const jwt = require('jsonwebtoken');
const jwksRSA = require('jwks-rsa');

const getToken = require('./get-token');
const verifyToken = require('./verify-token');

const {
  JWKS_URI,
  TOKEN_ISSUER, // highlight-line
  AUDIENCE // highlight-line
} = process.env;

const jwksClient = jwksRSA({
  cache: true,
  rateLimit: true,
  jwksUri: JWKS_URI
});
const getSigningKey = util.promisify(jwksClient.getSigningKey);

const verifyJwt = util.promisify(jwt.verify); // highlight-line

module.exports.verifyBearer = async event => {
  try {
    const token = getToken(event);
    const verifiedData = await verifyToken(
      token,
      jwt.decode,
      getSigningKey,
      verifyJwt, // highlight-line
      TOKEN_ISSUER, // highlight-line
      AUDIENCE // highlight-line
    );
  } catch (err) {
    console.log('Authorizer Error: ', err);

    throw new Error('Unauthorized');
  }
};
```

When the helper verifies the token, it will return the JWT payload data (with all claims) as `verifiedData`. For example:

```json
{
  "iss": "https://danillouz.eu.auth0.com/",
  "sub": "FHgLVARPk8oXjsP5utP8wYAnZePPAkw1@clients",
  "aud": "https://api.danillouz.dev/account",
  "iat": 1560762850,
  "exp": 1560849250,
  "azp": "FHgLVARPk8oXjsP5utP8wYAnZePPAkw1",
  "gty": "client-credentials"
}
```

### 6. Creating the auth response

We'll use the `verifiedData` to create the `authResponse`:

```js
'use strict';

const util = require('util');

const jwt = require('jsonwebtoken');
const jwksRSA = require('jwks-rsa');

const getToken = require('./get-token');
const verifyToken = require('./verify-token');

const { JWKS_URI, TOKEN_ISSUER, AUDIENCE } = process.env;

const jwksClient = jwksRSA({
  cache: true,
  rateLimit: true,
  jwksUri: JWKS_URI
});
const getSigningKey = util.promisify(jwksClient.getSigningKey);

const verifyJwt = util.promisify(jwt.verify);

module.exports.verifyBearer = async event => {
  try {
    const token = getToken(event);
    const verifiedData = await verifyToken(
      token,
      jwt.decode,
      getSigningKey,
      verifyJwt,
      TOKEN_ISSUER,
      AUDIENCE
    );

    // highlight-start
    const authResponse = {
      principalId: verifiedData.sub,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.methodArn
          }
        ]
      }
    };

    return authResponse;
    // highlight-end
  } catch (err) {
    console.log('Authorizer Error: ', err);

    throw new Error('Unauthorized');
  }
};
```

#### Principal identifier

The `authResponse.principalId` property must represent a unique (user) identifier associated with the token sent by the client. Auth0 provides this via the `sub` claim and ours has the value:

```json
{
  "iss": "https://danillouz.eu.auth0.com/",
  "sub": "FHgLVARPk8oXjsP5utP8wYAnZePPAkw1@clients", // highlight-line
  "aud": "https://api.danillouz.dev/account",
  "iat": 1560762850,
  "exp": 1560849250,
  "azp": "FHgLVARPk8oXjsP5utP8wYAnZePPAkw1",
  "gty": "client-credentials"
}
```

Note that if you use an Auth0 test token (like we'll do in a bit), the `sub` claim will be postfixed with `@clients`. This is because Auth0 automatically created a "Test Application" for us when we registered the Account API with them. And it's via this application that we obtain the test token--using the <a href="https://auth0.com/docs/flows/concepts/client-credentials" target="_blank" rel="noopener noreferrer">client credentials grant</a> to be specific (specified by the `gty` claim).

In this case the test application represents a "machine" and _not_ a user. But that's okay because the machine has a unique identifier the same way a user would have (by means of a client ID). This means that this implementation will also work when using "user centric" auth flows like the <a href="https://auth0.com/docs/flows/concepts/implicit" target="_blank" rel="noopener noreferrer">implicit grant</a>.

You can find the test application in the Auth0 dashboard by navigating to "Applications" and selecting "Account API (Test Application)":

<figure>
  <img src="./img/auth0/test-application.png" alt="Image that shows the Auth0 Test Application.">
  <figcaption>The client ID is <code class="language-text">FHgLVARPk8oXjsP5utP8wYAnZePPAkw1</code>, which matches the JWT <code class="language-text">sub</code> claim.</figcaption>
</figure>

#### Method ARN

The <a href="https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html" target="_blank" rel="noopener noreferrer">ARN</a> of the Lambda handler associated with the called endpoint can be obtained from `event.methodArn`. APIG will use this ARN to invoke said Lambda handler--in our case this will be the Lambda handler that gets the profile data.

#### Granting a client scopes

Like mentioned when discussing [scopes](#scopes), Auth0 can provide scopes as authorization information. In order for Auth0 to do this, we need to "grant" our client the `get:profile` scope. In our case, the client is the "Test Application" that has been created for us.

Navigate to the "APIs" tab in the "Test Application" details and click on the "right pointing chevron" (circled in red) to the right of "Account API":

<figure>
  <img src="./img/auth0/grant-scope-1.png" alt="Image that shows the Auth0 test application authorization settings.">
  <figcaption>Select the Account API.</figcaption>
</figure>

Then check the `get:profile` scope, click "Update" and click "Continue":

<figure>
  <img src="./img/auth0/grant-scope-2.png" alt="Image that shows how to grant the Auth0 test application the get profile scope.">
  <figcaption>Grant the <code class="language-text">get:profile</code> scope.</figcaption>
</figure>

Now the configured scope will be a claim on issued test tokens:

```json
{
  "iss": "https://danillouz.eu.auth0.com/",
  "sub": "FHgLVARPk8oXjsP5utP8wYAnZePPAkw1@clients",
  "aud": "https://api.danillouz.dev/account",
  "iat": 1560762850,
  "exp": 1560849250,
  "azp": "FHgLVARPk8oXjsP5utP8wYAnZePPAkw1",
  "scope": "get:profile", // highlight-line
  "gty": "client-credentials"
}
```

And therfore part of the `verifiedData`, so we can propagate it to downstream Lambda handlers like this:

```js
const authResponse = {
  principalId: verifiedData.sub,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: event.methodArn
      }
    ]
  },
  // highlight-start
  context: {
    scope: verifiedData.scope
  }
  // highlight-end
};
```

### 7. Releasing the Lambda Authorizer

Finally, add a release command to the `package.json`:

```json
{
  "name": "lambda-authorizers",
  "version": "1.0.0",
  "description": "APIG Lambda Authorizers.",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "release": "serverless deploy --stage prod" // highlight-line
  },
  "author": "Daniël Illouz",
  "license": "MIT",
  "dependencies": {
    "jsonwebtoken": "^8.5.1",
    "jwks-rsa": "^1.5.1"
  },
  "devDependencies": {
    "serverless": "^1.45.1"
  }
}
```

In order to upload the Lambda to AWS, <a href="https://portal.aws.amazon.com/billing/signup" target="_blank" rel="noopener noreferrer">signup</a> and make sure you have your <a href="https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html" target="_blank" rel="noopener noreferrer">credentials configured</a>. Then release the Lambda with:

```shell
npm run release
```

And enjoy watching Serverless do all the heavy lifting:

```shell
Serverless: Packaging service...
Serverless: Excluding development dependencies...
Serverless: Creating Stack...
Serverless: Checking Stack create progress...
.....
Serverless: Stack create finished...
Serverless: Uploading CloudFormation file to S3...
Serverless: Uploading artifacts...
Serverless: Uploading service lambda-authorizers.zip file to S3 (6.16 MB)...
Serverless: Validating template...
Serverless: Updating Stack...
Serverless: Checking Stack update progress...
...............
Serverless: Stack update finished...
Service Information
service: lambda-authorizers
stage: prod
region: eu-central-1
stack: lambda-authorizers-prod
resources: 5
api keys:
  None
endpoints:
  None
functions:
  auth0VerifyBearer: lambda-authorizers-prod-auth0VerifyBearer
layers:
  None
```

#### Finding the ARN

Now go to the AWS Console and visit the "Lambda" service. There, find `lambda-authorizers-prod-auth0VerifyBearer` under "Functions" and take note of the ARN in the top right corner:

<figure>
  <img src="./img/aws/lambda-authorizer-arn.png" alt="Image that shows where to find the Lambda Auhthorizer ARN in the AWS Lambda Console.">
  <figcaption>Find the ARN of the Lambda Authorizer.</figcaption>
</figure>

We'll need this to configure the Account API in the next part.

## Implementing the Account API

We'll do this by:

1. [Setting up the API project](#1-setting-up-the-api-project)
2. [Configuring the Serverless manifest](#2-configuring-the-serverless-manifest)
3. [Defining the Lambda handler](#3-defining-the-lambda-handler)
4. [Releasing the API](#4-releasing-the-api)
5. [Configuring the Lambda Authorizer](#5-configuring-the-lambda-authorizer)
6. [Adding authorization logic](#6-adding-authorization-logic)
7. [Releasing the API with auth enabled](#7-releasing-the-api-with-auth-enabled)
8. [Getting a test token](#8-getting-a-test-token)

### 1. Setting up the API project

Similar to the Lambda Authorizer, create a new directory for the code:

```shell
mkdir account-api
```

Move to this directory and initialize a new npm project with:

```shell
npm init -y
```

This creates a `package.json` file:

```shell
account-api
  └── package.json # highlight-line
```

Again, we'll use the Serverless Framework to configure and upload the Lambda to AWS, so install it as a "dev" dependency:

```shell
npm i -D serverless
```

### 2. Configuring the Serverless manifest

Create a `serverless.yaml` manifest file:

```shell
account-api
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  └── serverless.yaml # highlight-line
```

Add the following content to it:

```yaml
service: account-api

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src
```

Add the Lambda function definition for the `GET /profile` endpoint handler:

```yaml
service: account-api

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

# highlight-start
functions:
  getProfile:
    handler: src/handler.getProfile
    description: Gets the user profile data
    events:
      - http:
          path: /profile
          method: get
# highlight-end
```

### 3. Defining the Lambda handler

In order to match the Lambda function definition in the Serverless manifest, create a file named `handler.js` in `src`:

```shell
account-api
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  ├── serverless.yaml
  └── src
      └── handler.js # highlight-line
```

And in `src/handler.js` export a method named `getProfile`:

```js
'use strict';

module.exports.getProfile = async () => {
  try {
    // Lambda handler implementation goes here
  } catch (err) {
    const statusCode = err.code || 500;

    return {
      statusCode,
      body: JSON.stringify({
        message: err.message,
        info: err.info
      })
    };
  }
};
```

If something goes "wrong" in the Lambda, we'll return an error response as <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-output-format" target="_blank" rel="noopener noreferrer">HTTP output</a> back to the caller.

Otherwise we'll return the profile data:

```js
'use strict';

module.exports.getProfile = async () => {
  try {
    // highlight-start
    const profileData = {
      name: 'Daniël'
    };

    return {
      statusCode: 200,
      body: JSON.stringify(profileData)
    };
    // highlight-end
  } catch (err) {
    const statusCode = err.code || 500;

    return {
      statusCode,
      body: JSON.stringify({
        message: err.message,
        info: err.info
      })
    };
  }
};
```

Before we enable auth, let's first release the API to see if we can call the endpoint.

### 4. Releasing the API

Add a release command to the `package.json`:

```json
{
  "name": "account-api",
  "version": "1.0.0",
  "description": "Account API that returns a user profile.",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "release": "serverless deploy --stage prod" // highlight-line
  },
  "author": "Daniël Illouz",
  "license": "MIT",
  "devDependencies": {
    "serverless": "^1.45.1"
  }
}
```

Then release the Lambda with:

```shell
npm run release
```

Sit back and relax:

```shell
Serverless: Packaging service...
Serverless: Excluding development dependencies...
Serverless: Creating Stack...
Serverless: Checking Stack create progress...
.....
Serverless: Stack create finished...
Serverless: Uploading CloudFormation file to S3...
Serverless: Uploading artifacts...
Serverless: Uploading service account-api.zip file to S3 (374 B)...
Serverless: Validating template...
Serverless: Updating Stack...
Serverless: Checking Stack update progress...
..............................
Serverless: Stack update finished...
Service Information
service: account-api
stage: prod
region: eu-central-1
stack: account-api-prod
resources: 10
api keys:
  None
endpoints:
  GET - https://9jwhywe1n7.execute-api.eu-central-1.amazonaws.com/prod/profile # highlight-line
functions:
  getProfile: account-api-prod-getProfile
layers:
  None
```

Now try to call the endpoint that has been created for you. For example:

```shell
curl https://9jwhywe1n7.execute-api.eu-central-1.amazonaws.com/prod/profile
```

It should return:

```json
{ "name": "Daniël" }
```

### 5. Configuring the Lambda Authorizer

Now we know the endpoint is working, we'll protect it by adding a custom `authorizer` property in the `serverless.yaml` manifest:

```yaml
service: account-api

# highlight-start
custom:
  authorizer:
    arn: arn: aws:lambda:eu-central-1:ACCOUNT_ID:function:lambda-authorizers-prod-auth0VerifyBearer
    resultTtlInSeconds: 0
    identitySource: method.request.header.Authorization
    identityValidationExpression: '^Bearer [-0-9a-zA-z\.]*$'
    type: token
# highlight-end

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

functions:
  getProfile:
    handler: src/handler.getProfile
    description: Gets the user profile
    events:
      - http:
          path: /profile
          method: get
```

Let's go over the `authorizer` properties:

- `arn`: must be the value of the Lambda Authorizer ARN we [released](#finding-the-arn) before.
- `resultTtlInSeconds`: used to cache the IAM Policy document returned from the Lambda Authorizer. When enabled (caching is _disabled_ when set to `0`) and a policy document has been cached, the Lambda Authorizer will _not_ be executed. According to the AWS <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/configure-api-gateway-lambda-authorization-with-console.html" target="_blank" rel="noopener noreferrer">docs</a> the default value is `300` seconds and the max value is `3600` seconds.
- `identitySource`: where APIG should "look" for the bearer token.
- `identityValidationExpression`: the expression used to extract the token from the `identitySource`.

We'll use these properties to configure our endpoint with the Lambda Authorizer:

```yaml
service: account-api

custom:
  authorizer:
    arn: arn: aws:lambda:eu-central-1:ACCOUNT_ID:function:lambda-authorizers-prod-auth0VerifyBearer
    resultTtlInSeconds: 0
    identitySource: method.request.header.Authorization
    identityValidationExpression: '^Bearer [-0-9a-zA-z\.]*$'
    type: token

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3
  profile: danillouz

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

functions:
  getProfile:
    handler: src/handler.getProfile
    description: Gets the user profile
    events:
      - http:
          path: /profile
          method: get
          authorizer: ${self:custom.authorizer} # highlight-line
```

### 6. Adding authorization logic

Now the Lambda Authorizer is configured and we also propagate the `get:profile` scope from the Lambda Authorizer, we can check if a caller has been granted the required scope. If not, we'll return a `403 Forbidden` response back to the caller:

```js
'use strict';

const REQUIRED_SCOPE = 'get:profile'; // highlight-line

// highlight-start
module.exports.getProfile = async event => {
  // highlight-end
  try {
    // highlight-start
    const { authorizer = {} } = event.requestContext;
    const { scope = '' } = authorizer;
    const hasScope = scope.split(' ').includes(REQUIRED_SCOPE);
    if (!hasScope) {
      const err = new Error('Forbidden');
      err.code = 403;
      err.info = 'scope "get:profile" is required';

      throw err;
    }
    // highlight-end

    const profileData = {
      name: 'Daniël'
    };

    return {
      statusCode: 200,
      body: JSON.stringify(profileData)
    };
  } catch (err) {
    const statusCode = err.code || 500;

    return {
      statusCode,
      body: JSON.stringify({
        message: err.message,
        info: err.info
      })
    };
  }
};
```

Note that the `authorizer.scope` is a string and that it may contain more than one scope value. When multiple scopes are configured, they will be space separated like this:

```js
'get:profile update:profile';
```

### 7. Releasing the API with auth enabled

Do another release:

```shell
npm run release
```

After Serverless finishes, go to the AWS Console and visit the "API Gateway" service. There, navigate to "prod-account-api" and click on the "GET" resource under "/profile". You should now see that the "Method Request" tile has a property "Auth" set to `auth0VerifyBearer`:

<figure>
  <img src="./img/aws/apig-lambdas.png" alt="Image that shows the API Gateway resource configuration.">
  <figcaption>The resource is now configured with a custom authorization scheme.</figcaption>
</figure>

This means our `GET /profile` endpoint is properly configured with a Lambda Authorizer. And we now require a bearer token to get the profile data. Let's verify this by making the same `curl` request like before (without a token):

```shell
curl https://9jwhywe1n7.execute-api.eu-central-1.amazonaws.com/prod/profile
```

It should return:

```json
{ "message": "Unauthorized" }
```

### 8. Getting a test token

We can get a test token from the Auth0 dashboard by navigating to the "Test" tab in the API details screen:

<figure>
  <img src="./img/auth0/test.png" alt="Image that shows where to get a test token in the Auth0 dashboard.">
  <figcaption>Get a test token for your API.</figcaption>
</figure>

If you scroll to the bottom, you'll see a `curl` command displayed with a ready to use test token:

```shell
curl --request GET \
  --url http://path_to_your_api/ \
  --header 'authorization: Bearer eyJ...lKw'
```

Pretty cool right! Use this, but set the URL to your profile endpoint. For example:

```shell
curl --request GET \
  --url https://9jwhywe1n7.execute-api.eu-central-1.amazonaws.com/prod/profile \
  --header 'authorization: Bearer eyJ...lKw'
```

This should return the profile data again:

```json
{ "name": "Daniël" }
```

Additionally, sending a token without the required scope will return:

```json
{
  "message": "Error: Forbidden",
  "info": "scope \"get:profile\" is required"
}
```

Awesome! We successfully secured our API with a token based authentication strategy, so only authenticated- and authorized clients can access it!

## CORS headers

On a final note, when your API needs to return <a href="https://serverless.com/blog/cors-api-gateway-survival-guide" target="_blank" rel="noopener noreferrer">CORS headers</a>, make sure to add a <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/supported-gateway-response-types.html" target="_blank" rel="noopener noreferrer">custom API Gateway Response</a> as well:

```yaml
service: account-api

custom:
  authorizer:
    arn: arn: aws:lambda:eu-central-1:ACCOUNT_ID:function:lambda-authorizers-prod-auth0VerifyBearer
    resultTtlInSeconds: 0
    identitySource: method.request.header.Authorization
    identityValidationExpression: '^Bearer [-0-9a-zA-z\.]*$'
    type: token

provider:
  name: aws
  runtime: nodejs8.10
  stage: ${opt:stage, 'prod'}
  region: ${opt:region, 'eu-central-1'}
  memorySize: 128
  timeout: 3

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

functions:
  getProfile:
    handler: src/handler.getProfile
    description: Gets the user profile
    events:
      - http:
          path: /profile
          method: get
          authorizer: ${self:custom.authorizer}

# highlight-start
resources:
  Resources:
    GatewayResponseDefault4XX:
      Type: 'AWS::ApiGateway::GatewayResponse'
      Properties:
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'*'"
        ResponseType: DEFAULT_4XX
        RestApiId:
          Ref: 'ApiGatewayRestApi'
    GatewayResponseDefault5XX:
      Type: 'AWS::ApiGateway::GatewayResponse'
      Properties:
        ResponseParameters:
          gatewayresponse.header.Access-Control-Allow-Origin: "'*'"
          gatewayresponse.header.Access-Control-Allow-Headers: "'*'"
        ResponseType: DEFAULT_5XX
        RestApiId:
          Ref: 'ApiGatewayRestApi'
# highlight-end
```

When the Lambda Authorizer throws an error or returns a "Deny" policy, APIG will _not_ execute any Lambda handlers. This means that the CORS settings you added to the Lambda handler wont be applied. That's why we must define additional APIG response resources, to make sure we always return the proper CORS headers.

## In closing

In this post I showed you a way to implement "serverless auth" using a machine client. But it's fairly easy to use something like <a href="https://auth0.com/lock" target="_blank" rel="noopener noreferrer">Auth0 Lock</a> and implement a user centric auth flow.

This would allow your users to signup/login to (for example) your web app, and get a token from Auth0. The web app can then use the token to send requests (on behalf of the user) to a protected API.

I've implemented this in several Single Page Applications built with <a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">React</a> and was happy with the result. Let me know if you'd be interested in learning more about that, and I might write a follow-up that focuses on the frontend implementation.

You can find all code at <a href="https://github.com/danillouz/serverless-auth" target="_blank" rel="noopener noreferrer">github.com/danillouz/serverless-auth</a>.
