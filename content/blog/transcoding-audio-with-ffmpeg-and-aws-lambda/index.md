---
title: Transcoding audio with FFmpeg and AWS Lambda
date: '2019-10-27T13:35:21.293Z'
description: 'Exploring a scalable and cost-effective serverless audio transcoding pipeline.'
---

## TLDR

For my side project I'm transcoding WebM audio files into MP3. I initially started doing this with <a href="https://aws.amazon.com/elastictranscoder/" target="_blank" rel="noopener noreferrer">Amazon Elastic Transcoder</a>, which works pretty well. But after transcoding the same audio files with <a href="https://www.ffmpeg.org/" target="_blank" rel="noopener noreferrer">FFmpeg</a> + <a href="https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html" target="_blank" rel="noopener noreferrer">AWS Lambda Layers</a>, my initial testing shows that this implementation is around **3653 times cheaper** when compared to Amazon Elastic Transcoder--at least for _short audio files_ (duration of 3 minutes).

If you want to see the code for the audio transcoder, go to <a href="https://github.com/upstandfm/audio-transcoder" target="_blank" rel="noopener noreferrer">github.com/upstandfm/audio-transcoder</a>.

### Table of contents

- [Use case](#use-case)
- [In closing](#in-closing)

## Use case

I recently started working on a new side project called Upstand FM. It's a web app that allows you to record your voice, so other users of the app can listen to it.

In the app I used the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API" target="_blank" rel="noopener noreferrer">MediaStream Recording API</a> to easily record audio from the user's input device. It works really well, and you don't have to use any external libraries!<br/>
What's the catch then? Well, it only works in Firefox, Chrome and Opera. Hopefully it will soon also work in Safari--at the time of this writing you have to enable it via an experimental feature flag called "MediaRecorder", but not all events are supported. This means that the implementation you got working in Firefox or Chrome, probably won't work in Safari.<br/>
Even though that's a bit disappointing, I was okay with it for my use case.

### Why do you need to transcode audio?

You might be wondering (like I was), if we can record audio directly in the browser, and immediately use the result in our app, why do we even have to do this "transcoding" stuff?<br/>
Well, if we want other users to be able to listen to our recordings, we need to use a media format that is well supported across browsers and devices, like <a href="https://en.wikipedia.org/wiki/MP3" target="_blank" rel="noopener noreferrer">MP3</a> or <a href="https://en.wikipedia.org/wiki/MPEG-4_Part_14#.MP4_versus_.M4A" target="_blank" rel="noopener noreferrer">M4A</a>. But as it turns out, the Media Recording API can't record audio in all media formats. It depends on the user agent (i.e. browser) and their specific implementation of the Media Recorder API.<br/>

We can use the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported" target="_blank" rel="noopener noreferrer">isTypeSupported</a> method to figure out if we can record in a specific media type by providing it with a MIME type.

If we run the following code in the Firefox- (71) and Chrome (77) web console, we'll get:

```js
// "audio/mpeg" is the MIME type for MP3 files
MediaRecorder.isTypeSupported('audio/mpeg'); // false

// "audio/mp4" is the MIME type for M4A files
MediaRecorder.isTypeSupported('audio/mp4'); // false
```

Okay, we can't use those, but we can use <a href="https://www.webmproject.org/" target="_blank" rel="noopener noreferrer">WebM</a>:

```js
MediaRecorder.isTypeSupported('audio/webm'); // true
```

So we might have found a media format that allows us to create and listen to recordings in the browser, but it won't work well "outside" the browser. For example when downloading the file, or pushing it to other platforms. That's why we need to transcode it.

## In closing

In this post I showed you a way to implement "serverless audio transcoding".
