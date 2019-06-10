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
- The endpoints of the API are <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html" target="_blank" rel="noopener noreferrer">Lambda Proxy Integrations</a> (i.e. Lambda handlers).
- The Lambda handlers are implemented using <a href="https://nodejs.org/en/" target="_blank" rel="noopener noreferrer">Node.js</a> and <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">serverless</a> framework.
- <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a> is used as a third party auth provider.

I'll focus on the "backend" and will use `curl` as the client to call the API. But it's fairly easy to (for example) use <a href="https://auth0.com/lock" target="_blank" rel="noopener noreferrer">Auth0 Lock</a> to add auth to the "frontend" as well. I've implemented it on several Single Page Applications built with <a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">React</a> and was very happy with the result.

## Why use a third party auth provider?

Before we get started, I think it's important to explain the motivation behind this decision.

In order to secure our API we can use:

- <a href="https://oauth.net/2/" target="_blank" rel="noopener noreferrer">OAuth 2.0</a>: an authorization protocol.

- <a href="https://openid.net/connect/" target="_blank" rel="noopener noreferrer">OpenID Connect (OIDC)</a>: an authentication protocol (a simple identity layer built on top of OAuth 2.0).

- <a href="https://auth0.com/learn/token-based-authentication-made-easy/" target="_blank" rel="noopener noreferrer">Token based auth</a>: a strategy that allows clients to send "auth information" to a protected API, when making requests on behalf of a user or themselves (e.g. sending a <a href="https://oauth.net/2/bearer-tokens/" target="_blank" rel="noopener noreferrer">bearer token</a> via an HTTP request header).

Now, you could choose to implement this yourself and build your own "auth server". But I think that (in most cases) you should _not_ do this. Why not? Because it will require all your focus to build, operate and maintain it. Or in other words, it will cost you (and your team) a _lot_ of time, energy and money.

And even if you do manage to build it, the result can be poor. There will be bugs and edge cases you didn't think off. But because auth is a non trivial problem to solve, you might even implement (parts of) the spec incorrectly.

If you do have a valid use case to build your own auth server, tread carefully. **A poor implementation will lead to a bad user experience and is also dangerous, because it can compromise your users and organization.**

What should you do then? In my opinion, use a third party auth provider like <a href="https://aws.amazon.com/cognito/" target="_blank" rel="noopener noreferrer">Cognito</a> or <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a>. They give you all the fancy tooling and scalable infrastructure you will need to help you provide a secure, reliable, performant and usable solution. Sure, you'll have to pay for it, but the pricing is _very_ fair. And it will most likely be a small fraction of what it would cost you when you'd roll your own solution.

Another (sometimes overlooked) benefit of choosing _buy over build_, is that you'll get access to the domain expert's _knowledge_. They will advise and help you choose the best auth strategy for you use case. And there's usually also a <a href="https://community.auth0.com/" target="_blank" rel="noopener noreferrer">community</a> you can turn to. **But leaving the complexities and challenges of auth to the experts gives you the ability to focus on your own things again**.

However, I do recommend you build an auth service yourself for learning purposes. I think it's quite fun and challenging. More importantly, you'll get a deeper understanding of the subject--which will be _very_ helpful when you're navigating the "documentation jungle" of your favorite auth provider.

Okay, lets get started!

## What will we build?

We'll build an Account API with a single endpoint that returns some profile data.

This endpoint is protected and requires a bearer token to return the profile data. The token will be sent via the `Authorization` request header.

**Endpoint:**

```
GET /profile
```

**Request Headers:**

| Name            | Required | Description                                                                                         |
| --------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `Authorization` | Yes      | Contains the client's token in the format `Bearer TOKEN`. Note that `Bearer` _must_ be capitalized. |

**Example Request:**

```
HTTP GET /profile HTTP/1.1
Authorization: Bearer eyJ...lKw
```

**Example Response:**

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

And if you scroll to the bottom, you'll see a `curl` command displayed with a ready to use token:

```
curl --request GET \
  --url http://path_to_your_api/ \
  --header 'authorization: Bearer eyJ...lKw
```

Pretty cool right! We'll use this after we implement the Lambda Authorizer and the API endpoint.

## What's a Lambda Authorizer?

The Lambda Authorizer is a feature of APIG to control access to our API. From the AWS <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html#api-gateway-lambda-authorizer-flow" target="_blank" rel="noopener noreferrer">docs</a>:

> A Lambda authorizer is useful if you want to implement a custom authorization scheme that uses a bearer token authentication strategy such as OAuth...

When a client makes a request to the APIG (i.e. the Account API), AWS will invoke the Lambda Authorizer _first_ (when configured). The Lambda Authorizer then extracts the bearer token from the `Authorization` request header and validates it with Auth0 by:

1. Fetching a public JWKS key from the JWKS URI.
2. Verifying the token is signed with the public key.
3. Verifying the token has the required "Issuer" and "Audience" claims.

Only when the token passes these checks, the Lambda Authorizer will output an <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html" target="_blank" rel="noopener noreferrer">IAM Policy</a> document:

```json
{
  "policyDocument": {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Action": "execute-api:Invoke",
        "Effect": "Allow",
        "Resource": "ARN_OF_LAMBDA_HANDLER"
      }
    ]
  }
}
```

It's this policy that tells APIG that it's "okay" to invoke a downstream Lambda handler. In our case the Lambda handler that returns the profile data.

Note that the Lambda Authorizer will actually only _authenticate_ the caller (I know, terminology right!). But it's possible for the Lambda Authorizer to propagate `context` information to any downstream Lambdas. And this "context information" can be used by the downstream Lambda to do _authorization_. When using OAuth 2.0, scopes can be used and provided to a Lambda handler to achieve this.

The handler can determine if the caller is allowed to make the request. For example, in our case we could have a `get:profile` scope. And the Lambda handler could check if it has this scope in their `context` Object when executing. If it's not there it can return a `403 Forbidden`.
