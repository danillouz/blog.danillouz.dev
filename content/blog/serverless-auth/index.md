---
title: Serverless Auth
date: '2019-06-07T17:03:43.227Z'
description: 'How to protect AWS API Gateway endpoints with Lambda and Auth0.'
---

Auth is complicated, it can be difficult to reason about and hard to work with. The terminology can be complex as well--terms are sometimes used interchangeably or can be ambiguous. Like saying "auth" to refer to both authentication (who are you?) _and_ authorization (I know who you are, but what are you allowed to do?).

On top of that, it can also be challenging to know when to use what. Depending on what you're building and for whom, different auth protocols and strategies might be more suitable or required.

I won't be covering these protocols and strategies in depth. Instead, I want to show you that implementing something as complex as auth can be quite simple. In order to do that, I'll focus on a specific (but common) use case. And show you how it can be implemented using a specific set of (serverless) technologies.

## Use case and technologies

> How can we secure an HTTP API with a token based auth strategy. So only authenticated- and authorized users can access it via a web client?

More specifically:

- The HTTP API is an <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" target="_blank" rel="noopener noreferrer">AWS API Gateway</a> (APIG).
- The endpoints of the API are <a href="https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html" target="_blank" rel="noopener noreferrer">Lambda Proxy Integrations</a> (i.e. Lambda handlers).
- The Lambda handlers are implemented using <a href="https://nodejs.org/en/" target="_blank" rel="noopener noreferrer">Node.js</a> and <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">serverless</a> framework.
- The web client is a <a href="https://en.wikipedia.org/wiki/Single-page_application" target="_blank" rel="noopener noreferrer">Single Page Application</a> (SPA) built with <a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">React</a>.
- <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a> is used as a third party auth provider.

## Why use a third party auth provider?

I think it's important to explain the motivation behind this decision before we get started.

In order to secure our API we can use:

- <a href="https://oauth.net/2/" target="_blank" rel="noopener noreferrer">OAuth 2.0</a>: an authorization protocol.

- <a href="https://openid.net/connect/" target="_blank" rel="noopener noreferrer">OpenID Connect (OIDC)</a>: an authentication protocol (a simple identity layer built on top of OAuth 2.0).

- <a href="https://auth0.com/learn/token-based-authentication-made-easy/" target="_blank" rel="noopener noreferrer">Token based auth</a>: a strategy that allows clients (like a SPA) to send "auth information" to a protected API when making requests on behalf of a user (e.g. sending a <a href="https://oauth.net/2/bearer-tokens/" target="_blank" rel="noopener noreferrer">Bearer Token</a> via an HTTP request header).

You could choose to implement this yourself and build your own "auth server". But I think that (in most cases) you should _not_ do this. Why not? Because it will require all your focus to build, operate and maintain it. Or in other words, it will cost you (and your team) a _lot_ of time, energy and money.

And even if you do manage to build it, the result can be poor. There will be bugs and edge cases you didn't think off. But because auth is a non trivial problem to solve, you might even implement (parts of) the spec incorrectly.

If you do have a valid use case to build your own auth server, tread carefully. **A poor implementation will lead to a bad user experience and is also dangerous, because it can compromise your users and organization.**

What should you do then? In my opinion, use a third party auth provider like <a href="https://aws.amazon.com/cognito/" target="_blank" rel="noopener noreferrer">Cognito</a> or <a href="https://auth0.com/" target="_blank" rel="noopener noreferrer">Auth0</a>. They give you all the fancy tooling and scalable infrastructure you will need to help you provide a secure, reliable, performant and usable solution. Sure, you'll have to pay for it, but the pricing is _very_ fair. And it will most likely be a small fraction of what it would cost you when you'd roll your own solution.

Another (sometimes overlooked) benefit of choosing _buy over build_, is that you'll get access to the domain expert's _knowledge_. They will advise and help you choose the best auth strategy for you use case. And there's usually also a <a href="https://community.auth0.com/" target="_blank" rel="noopener noreferrer">community</a> you can turn to. **But leaving the complexities and challenges of auth to the experts gives you the ability to focus on your own things again**.

However, I do recommend you build an auth service yourself for learning purposes. I think it's quite fun and challenging. More importantly, you'll get a deeper understanding of the subject--which will be _very_ helpful when you're navigating the "documentation jungle" of your favorite auth provider.

Okay, lets get started!
