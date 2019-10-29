---
title: Transcoding audio with FFmpeg and AWS Lambda
date: '2019-10-27T13:35:21.293Z'
description: 'Exploring a scalable and cost-effective serverless audio transcoding pipeline.'
---

## TL;DR

For my side project I'm transcoding WebM audio files into MP3. I initially started doing this with <a href="https://aws.amazon.com/elastictranscoder/" target="_blank" rel="noopener noreferrer">Amazon Elastic Transcoder</a>, which works pretty well. But after transcoding the same audio files with <a href="https://www.ffmpeg.org/" target="_blank" rel="noopener noreferrer">FFmpeg</a> + <a href="https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html" target="_blank" rel="noopener noreferrer">AWS Lambda Layers</a>, my initial testing shows that this implementation is around **3653 times cheaper** when compared to Amazon Elastic Transcoder--at least for _short audio files_ (maximum duration of 3 minutes).

If you want to see the code for the audio transcoder, go to <a href="https://github.com/upstandfm/audio-transcoder" target="_blank" rel="noopener noreferrer">github.com/upstandfm/audio-transcoder</a>.

### Table of contents

- [Use case](#use-case)
- [What does transcoding even mean?](#what-does-transcoding-even-mean)
- [In closing](#in-closing)

## Use case

I recently started working on a new side project called Upstand FM. It's a web app that allows you to record your voice, so other users of the app can listen to it.

In the app I used the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API" target="_blank" rel="noopener noreferrer">MediaStream Recording API</a> to easily record audio from the user's input device. It works really well, and you don't have to use any external libraries!<br/>
What's the catch then? Well, it only works in Firefox, Chrome and Opera. Hopefully it will soon also work in Safari--at the time of this writing you have to enable it via an experimental feature flag called "MediaRecorder", but not all events are supported. This means that the implementation you got working in Firefox or Chrome, probably won't work in Safari.<br/>
Even though that's a bit disappointing, I was okay with it for my use case.

## What does transcoding even mean?

Before I can answer that, we need to ask a different question:

> What's an audio file?

We can think of an audio file like a stream of data elements wrapped in a container. This container is formally called a <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers" target="_blank" rel="noopener noreferrer">media container format</a>, and it's basically a _file format_ (file type) that can store different types of data elements (bits).<br/>
The container describes how this data "coexists" in a file. Some container formats only support audio, like <a href="https://en.wikipedia.org/wiki/WAV" target="_blank" rel="noopener noreferrer">WAVE</a> (usually refered to as WAV). And others support both audio and video, like <a href="https://www.webmproject.org/" target="_blank" rel="noopener noreferrer">WebM</a>.

So a container "wraps" data to store it in a file, but information can be stored in different ways. And we'll also want to _compress_ the data to optimize for storage and/or bandwith by _encoding_ it (converting it from one "form" to another).<br/>
This is where a _codec_ (**co**der/**dec**oder) comes into play. It handles all the processing that's required to encode (compress) and decode (decompress) the audio data.

Therefore, in order to define the format of an audio file (or video file), we need both a container and a codec. For example, when the MPEG-1 Audio Layer III codec is used to store only audio data in an <a href="https://en.wikipedia.org/wiki/MPEG-4" target="_blank" rel="noopener noreferrer">MPEG-4</a> container, we get an MP3 file (even though it's technically still an MPEG format file).

> Fun fact: a container is not always required!
>
> "<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API " target="_blank" rel="noopener noreferrer">WebRTC</a> does not use a container at all. Instead, it streams the encoded audio and video tracks directly from one peer to another using `MediaStreamTrack` objects to represent each track."
>
> <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers" target="_blank" rel="noopener noreferrer">MDN web docs</a>

So what does transcoding mean? If we convert one encoding into another, this process is called _transcoding_. And if we convert one container format into another, this process is called _transmuxing_.

There are a lot of codecs available, where each codec will have a different effect on the _quality_, _size_ and _compatibility_ of the audio file. If you'd like to learn more about audio codecs, I recommend reading the <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Audio_codecs" target="_blank" rel="noopener noreferrer">Mozilla web audio codec guide</a>.

### Why do you need to transcode audio?

You might be wondering (like I was), if we can record audio directly in the browser, and immediately use the result in our app, why do we even have to transcode it?<br/>
The answer is to optimize for compatibility, because the Media Recording API can't record audio in all media formats.<br/>
Which formats are supported depend on the user agent (i.e. browser) and their specific implementation of the Media Recording API.

We can use the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported" target="_blank" rel="noopener noreferrer">isTypeSupported</a> method to figure out if we can record in a specific media type by providing it with a <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types" target="_blank" rel="noopener noreferrer">MIME</a> type.<br/>
<a href="https://en.wikipedia.org/wiki/MP3" target="_blank" rel="noopener noreferrer">MP3</a> has good compatibility, but isn't supported by the Media Recording API. If we run the following code in the web console (Firefox or Chrome), we'll get:

```js
MediaRecorder.isTypeSupported('audio/mpeg'); // false
```

Okay, what can we use then? WebM is supported:

```js
MediaRecorder.isTypeSupported('audio/webm'); // true
```

You can even specify the codec in addition to the container:

```js
MediaRecorder.isTypeSupported('audio/webm;codecs=opus'); // true
```

So if we want to end up with MP3 files (MPEG-4 container + MPEG-1 Audio Layer III codec) of the recordings (to maximize compatibility), we need to transcode (and technically also transmux) the WebM files.

## In closing

In this post I showed you a way to implement "serverless audio transcoding".
