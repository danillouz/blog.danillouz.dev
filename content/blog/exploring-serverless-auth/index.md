---
title: Exploring Serverless Auth
date: '2019-06-06T19:50:08.597Z'
description: 'How to protect AWS API Gateway endpoints with Auth0 and an AWS Lambda Authorizer.'
---

We're going to explore how to protect <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" target="_blank" rel="noopener noreferrer">AWS API Gateway</a> endpoints with <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a> and an <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-use-lambda-authorizer.html" target="_blank" rel="noopener noreferrer">AWS Lambda Authorizer</a>.

## Prelude

Authentication (authN) and authorization (authZ) are complicated topics. And this can make it difficult to reason about- and work with software that requires or uses this functionality.

The terminology in this domain can be complex as well. Sometimes terms are used interchangeably or can be ambiguous. Like saying "auth" to refer to both authentication (who are you?) and authorization (I know who you are, but what are you allowed to do?).

On top of that, it can also be difficult to know when to use what. Depending on what we're building and for whom, different auth protocols and strategies might be more suitable or required.

I won't be covering these protocols and strategies in depth. But will focus on a specific auth use case instead. And break down how it can be implemented, using a specific set of (serverless) technologies.

## Use case and technologies

> How can we secure an HTTP API with a token based auth strategy. So that only authenticated- and authorized web clients can access it on behalf of the user?

Or in other words. How can we make sure that only users logged into a web client, can successfully communicate with an API over HTTP.

More specifically:

- The HTTP API is an <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" target="_blank" rel="noopener noreferrer">AWS API Gateway</a> (APIG).
- The endpoints of the API are <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html" target="_blank" rel="noopener noreferrer">Lambda Proxy Integrations</a> (i.e. Lambda handlers).
- The web client is a <a href="https://en.wikipedia.org/wiki/Single-page_application" target="_blank" rel="noopener noreferrer">Single Page Application</a> (SPA) built with <a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">React</a>.

Even though the use case is specific, it's quite common when building for the web.

## Auth protocols, strategies and third party providers

Before we dive in, I want to touch upon the following auth protocols and strategy:

- <a href="https://oauth.net/2/" target="_blank" rel="noopener noreferrer">OAuth 2.0</a>: an authZ protocol.

- <a href="https://openid.net/connect/" target="_blank" rel="noopener noreferrer">OpenID Connect (OIDC)</a>: an authN protocol (a simple identity later built on top of OAuth 2.0).

- <a href="https://auth0.com/learn/token-based-authentication-made-easy/" target="_blank" rel="noopener noreferrer">Token based auth</a>: a strategy that allows clients (like a SPA) to send "auth information" to a protected API and make requests on behalf of the user (e.g. a <a href="https://oauth.net/2/bearer-tokens/" target="_blank" rel="noopener noreferrer">Bearer Token</a> via an HTTP request header).

These protocols can be used to secure our API. And you could choose to implement them yourself. Meaning, you could build your own "auth server". But I think that (in most cases) you should _not_ do this.

Why not? Because it will cost you (and your team) a _lot_ of time, energy and money. Not only to build it, but also to operate and maintain it! And even if you do manage to build it, the result will most likely be poor. There will be bugs, edge cases you didn't think off and you might even implement (parts) of the spec incorrectly.

If you do have a valid use case to build your own auth server, tread carefully. A poor implementation will lead to a horrible user experience. And is _dangerous_ because it can compromise your users and organization.

What should you do then? In my opinion, just use a third party auth service like <a href="https://aws.amazon.com/cognito/" target="_blank" rel="noopener noreferrer">Cognito</a> or <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a>. They give you all the tools and infrastructure you need to provide a secure, reliable and usable auth service for a _very_ fair price. Especially compared to what it would cost you when rolling your own solution.

Another great benefit of choosing _buy over build_ is that you leave the complexities and challenges of auth to the experts. This allows you to focus on building and operating your own apps and services. Win win!

However, I do recommend you build such a service for learning purposes. I think it's quite fun and challenging. Most importantly, it will give you a deeper understanding of the subject. Which will be very helpfull when navigating the "documentation jungle" of your favorite auth provider.

I'll be using Auth0 in this post. I think they're great. It's easy to setup and use. They have a lot of resources in terms of documentation and code examples. An extensive API and SDKs in multiple languages. The community is active and the service is fast and affordable.

Okay, with that out of the way, lets get started!

## The API

I'll be using <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">Serverless Framework</a> in the code examples.