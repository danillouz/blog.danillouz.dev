---
title: Serverless Auth
date: '2019-06-07T17:03:43.227Z'
description: 'How to protect AWS API Gateway endpoints with Lambda and Auth0.'
---

> 'Auth is complicated'.

It can be difficult to reason about- and hard to work with auth. The terminology can be complex as well--terms are sometimes used interchangeably or can be ambiguous. Like saying "auth" to refer to both authentication (who are you?) _and_ authorization (I know who you are, but what are you allowed to do?).

On top of that, it can also be challenging to know when to use what. Depending on what you're building and for whom, different auth protocols and strategies might be more suitable or required.

I won't be covering these protocols and strategies in depth. Instead, I want to show you that implementing something as complex as auth can be quite simple. In order to do that, I'll focus on a specific (but common) use case. And show you how it can be implemented using a specific set of (serverless) technologies.

## Use case and technologies

> How can we secure an HTTP API with a token based auth strategy. So only authenticated- and authorized users can access it via a (web) client?

More specifically:

- The HTTP API is an <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" target="_blank" rel="noopener noreferrer">AWS API Gateway</a> (APIG).
- The API's endpoints are protected with a <a href="https://oauth.net/2/bearer-tokens/" target="_blank" rel="noopener noreferrer">bearer token</a>.
- The endpoints of the API are <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html" target="_blank" rel="noopener noreferrer">Lambda Proxy Integrations</a> (i.e. Lambda handlers).
- The Lambda handlers are implemented using <a href="https://nodejs.org/en/" target="_blank" rel="noopener noreferrer">Node.js</a> and <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">serverless</a> framework.
- <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a> is used as a third party auth provider.
- A <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html" target="_blank" rel="noopener noreferrer">Lambda Authorizer</a> is used to verify the bearer token with Auth0.

I'll focus on the "backend" and will use `curl` as the client to call the API. But it's fairly easy to (for example) use <a href="https://auth0.com/lock" target="_blank" rel="noopener noreferrer">Auth0 Lock</a> to add auth to the "frontend" as well. I've implemented it on several Single Page Applications built with <a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">React</a> and was very happy with the result.

## Why use a third party auth provider?

Before we get started, I think it's important to explain the motivation behind this decision.

In order to secure our API we can use:

- <a href="https://oauth.net/2/" target="_blank" rel="noopener noreferrer">OAuth 2.0</a>: an authorization protocol.

- <a href="https://openid.net/connect/" target="_blank" rel="noopener noreferrer">OpenID Connect (OIDC)</a>: an authentication protocol (a simple identity layer built on top of OAuth 2.0).

- <a href="https://auth0.com/learn/token-based-authentication-made-easy/" target="_blank" rel="noopener noreferrer">Token based auth</a>: a strategy that allows clients to send "auth information" to a protected API, when making requests on behalf of a user or themselves (e.g. sending a bearer token via an HTTP request header).

Now, you could choose to implement this yourself and build your own "auth server". But I think that (in most cases) you should _not_ do this. Why not? Because it will require all your focus to build, operate and maintain it. Or in other words, it will cost you (and your team) a _lot_ of time, energy and money.

And even if you do manage to build it, the result can be poor. There will be bugs and edge cases you didn't think off. But because auth is a non trivial problem to solve, you might even implement (parts of) the spec incorrectly.

If you do have a valid use case to build your own auth server, tread carefully. **A poor implementation will lead to a bad user experience and is also dangerous, because it can compromise your users and organization.**

What should you do then? In my opinion, use a third party auth provider like <a href="https://aws.amazon.com/cognito/" target="_blank" rel="noopener noreferrer">Cognito</a> or <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a>. They give you all the fancy tooling and scalable infrastructure you will need to help you provide a secure, reliable, performant and usable solution. Sure, you'll have to pay for it, but the pricing is _very_ fair. And it will most likely be a small fraction of what it would cost you when you'd roll your own solution.

Another (sometimes overlooked) benefit of choosing _buy over build_, is that you'll get access to the domain expert's _knowledge_. They will advise and help you choose the best auth strategy for you use case. And there's usually also a <a href="https://community.auth0.com/" target="_blank" rel="noopener noreferrer">community</a> you can turn to. **But leaving the complexities and challenges of auth to the experts gives you the ability to focus on your own things again**.

However, I do recommend you build an auth service yourself for learning purposes. I think it's quite fun and challenging. More importantly, you'll get a deeper understanding of the subject--which will be _very_ helpful when you're navigating the "documentation jungle" of your favorite auth provider.

Okay, lets get started!

## What will we build?

We'll build an Account API with a single endpoint that returns some profile data.

Requirements and constraints:

- The endpoint will be `GET /profile`.
- The endpoint will require a bearer token to return the profile data.
- The token will be sent via the `Authorization` request header.
- The `Authorization` request header value must have the format: `Bearer TOKEN`.
- The token is verified by a Lambda Authorizer.
- The business logic of the endpoint will be implemented by a Lambda handler.
- The endpoint will return data as JSON.
- The endpoint will return a single property `name` with value `Daniël`.
- The endpoint will return HTTP status code `200`.

### Example

Request:

```
HTTP GET /profile HTTP/1.1
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

## Register the API with Auth0

When the Account API receives a request with the bearer token, it will have to validate the token with Auth0. In order to that, we first have to register our API with them:

1. Create an Auth0 account and setup your tenant.
2. In the main menu go to "APIs" and click on "Create API".
3. Follow the <a href="https://auth0.com/docs/apis" target="_blank" rel="noopener noreferrer">instructions</a> and provide a "name" and "identifier". For example `Account API` and `https://api.danillouz.dev/account`.

<figure>
  <img src="./img/auth0/register.png" alt="Register you API with Auth0 by providing a name and identifier.">
  <figcaption>Register you API with Auth0 by providing a name and identifier.</figcaption>
</figure>

Now that our API is registered, we need to take note of the following (public) properties, to later on configure our Lambda Authorizer correctly:

- Token issuer: this is basically your Auth0 tenant. It always has the format `https://TENANT_NAME.REGION.auth0.com`. For example `https://danillouz.eu.auth0.com/`.
- JWKS URI: this returns a <a href="https://auth0.com/docs/jwks" target="_blank" rel="noopener noreferrer">JSON Web Key Set (JWKS)</a>, which will be used by the Lambda Authorizer to obtain a public key from Auth0 to verify the token (more on that later). It always has the format `https://TENANT_NAME.REGION.auth0.com/.well-known/jwks.json`. For example `https://danillouz.eu.auth0.com/.well-known/jwks.json`.
- Audience: this is `identifier` that was provided at step `3`. For example `https://api.danillouz.dev/account`.

You can also find these values in the "Quick Start" section of the Auth0 API details screen (you were redirected here after registering the API). For example, click on the "Node.js" tab and look for these properties:

- `issuer`
- `jwksUri`
- `audience`

<figure>
  <img src="./img/auth0/quick-start.png" alt="Find your public auth properties.">
  <figcaption>Find your public auth properties.</figcaption>
</figure>

Now navigate to the "Test" tab in the Auth0 API details screen:

<figure>
  <img src="./img/auth0/test.png" alt="Get a generated test token for you API.">
  <figcaption>Get a generated test token for you API.</figcaption>
</figure>

And if you scroll to the bottom, you'll see a `curl` command displayed with a ready to use test token:

```
curl --request GET \
  --url http://path_to_your_api/ \
  --header 'authorization: Bearer eyJ...lKw
```

Pretty cool right! We'll use this command after we implement the Lambda Authorizer and the API endpoint.

## What's a Lambda Authorizer?

The Lambda Authorizer is a feature of APIG to control access to our API. From the AWS <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html" target="_blank" rel="noopener noreferrer">docs</a>:

> A Lambda authorizer is useful if you want to implement a custom authorization scheme that uses a bearer token authentication strategy such as OAuth...

There are two types of authorizers:

1. Token based-authorizer.
2. Request parameter-based authorizer.

And we'll be using the token-based one, which supports bearer tokens.

### What should it do?

When a client makes a request to APIG, AWS will invoke the Lambda Authorizer _first_ (if configured). The Lambda Authorizer must then extract the bearer token from the `Authorization` request header and validate it with Auth0 by:

1. Fetching the JWKS (with public key) from Auth0 using the [JWKS URI](#register-the-api-with-auth0).
2. Verifying the token signature with the fetched public key.
3. Verifying the token has the required ["Issuer" and "Audience"](#register-the-api-with-auth0) claims.

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

It's this policy that tells APIG it's _allowed_ to invoke our downstream Lambda handler--in our case, the Lambda handler that returns the profile data.

Alternatively the Lambda authorizer may _deny_ invoking the downstream handler by setting `Effect` to `Deny`:

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

This will make APIG respond with `403 Forbidden`. Or you may return an `Unauthorized` error from the Lambda Authorizer to have APIG respond with `401 Unauthorized`.

### A note on authorization

I think it's good practice to only _authenticate_ the caller from the Lambda Authorizer and apply _authorization_ logic in any downstream Lambda handlers.

This may not be possible in all use cases, but if it is, it will keep your Lambda authorizer nice and _simple_--being only responsible for verifying the token and providing downstream Lambda's with authorization information.

You can propagate authorization information by returning a `context` object in the Lambda Authorizer's reponse. And this object can be used by downstream Lambda's to apply authorization logic. When using OAuth 2.0, scopes can be used and provided to achieve this. The Lambda handler can then determine if the caller is allowed to make a request. For example, in our case we could have a `get:profile` scope. And the Lambda handler could check if it has this scope in its `context` object when executing. If it's not there it can return a `403 Forbidden`.

We'll see this in action when we implement the Lambda Authorizer.

## How does the flow look like?

We're now ready to implement the Lambda Authorizer and the Account API (endpoint). But before we do, let's take a step back and solidify our mental model.

To summarize, we have the following "moving parts":

- Auth0 as the third party auth provider that provides- and helps verify the token.
- AWS APIG that represents the Account API.
- A Lambda Authorizer that verifies the token with Auth0.
- A Lambda handler for the `GET /profile` endpoint, that returns the profile data.
- `curl` as the client to make requests to the API.

We can visualize how these parts interact with each other as follows:

<figure>
  <img src="./img/auth-flow.png" alt="Auth flow visualized.">
  <figcaption>Auth flow visualized.</figcaption>
</figure>

<ol>
  <li>The client (curl) makes the HTTP request to the APIG (the account API) and send the token (obtained from the Auth0 API details "Test" tab) via the Authorization header.</li>

  <li>With the incoming HTTP request, APIG checks if a Lambda Authorizer is configured for the endpoint. If so, APIG invokes it and provides the Authorization header.</li>

  <li>The Lambda Authorizer then:
    <ul>
      <li>extracts the token from the Authorization header</li>
      <li>fetches the JWKS (with the public key) from Auth0</li>
      <li>verifies the token signature with the fetched public key</li>
      <li>verifies the token has the required "Issuer" and "Audience" claims</li>
    </ul>
  </li>

  <li>If the token is verified, the Lambda Authorizer returns an IAM Policy document with "Effect" set to "Allow".</li>

  <li>APIG evaluates the IAM Policy and when the "Effect" is:
    <ul>
      <li>"Deny": APIG returns "403 Forbidden"</li>
      <li>"Allow": APIG Invokes the Lambda handler</li>
    </ul>
  </li>

  <li>The Lambda handler executes and returns the profile data back to the client.</li>
</ol>
