---
title: Transcoding audio with FFmpeg and AWS Lambda
date: '2019-10-27T13:35:21.293Z'
description: 'Exploring a scalable and cost-effective serverless audio transcoding pipeline.'
---

## TL;DR

For my side project I'm transforming WebM audio files into MP3. I initially started doing this with <a href="https://aws.amazon.com/elastictranscoder/" target="_blank" rel="noopener noreferrer">Amazon Elastic Transcoder</a>, which works pretty well. But after doing the same with <a href="https://www.ffmpeg.org/" target="_blank" rel="noopener noreferrer">FFmpeg</a> + <a href="https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html" target="_blank" rel="noopener noreferrer">AWS Lambda Layers</a>, my initial testing shows that this implementation is around **3653 times cheaper**--at least for _short audio files_ that have a max duration of 3 min.

If you want to see the code for the audio transcoder, go to <a href="https://github.com/upstandfm/audio-transcoder" target="_blank" rel="noopener noreferrer">github.com/upstandfm/audio-transcoder</a>.

### Table of contents

- [Use case](#use-case)
- [What does transcoding even mean?](#what-does-transcoding-even-mean)
- [Transcoding audio](#transcoding-audio)
- [In closing](#in-closing)

## Use case

I recently started working on a new side project called <a href="https://www.upstand.fm/" target="_blank" rel="noopener noreferrer">Upstand FM</a>. It's a web app that allows you to record your voice, so other users of the app can listen to what you have to say.

In the app I use the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API" target="_blank" rel="noopener noreferrer">MediaStream Recording API</a> (aka Media Recording API) to easily record audio from the user's input device. It works really well, and you don't have to use any external libraries!<br/>
There's one catch though--it only works in Firefox, Chrome and Opera. And at the time of this writing, it "sort of" works in Safari (it's hidden behind a feature flag and not all events are supported). Even though that's a bit disappointing, I'm okay with it for my use case.

So after I had built something functional that allowed me to record my voice, it turned out that the audio file I ended up with had to be _transcoded_ if I wanted to listen to it across a wide range of browsers and devices. And thus my adventure began.

## What does transcoding even mean?

Before I can answer that, we need to explore _what_ an audio file is.

We can think of an audio file like a stream of data elements wrapped in a container. This container is formally called a <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers" target="_blank" rel="noopener noreferrer">media container format</a>, and it's basically a _file format_ (think file type) that can store different types of data elements (bits).<br/>
The container describes how this data "coexists" in a file. Some container formats only support audio, like <a href="https://en.wikipedia.org/wiki/WAV" target="_blank" rel="noopener noreferrer">WAVE</a> (usually referred to as WAV). And others support both audio and video, like <a href="https://www.webmproject.org/" target="_blank" rel="noopener noreferrer">WebM</a>.

So a container "wraps" data to store it in a file, but information can be stored in different ways. And we'll also want to _compress_ the data to optimize for storage and/or bandwith by _encoding_ it (converting it from one "form" to another).<br/>
This is where a _codec_ (**co**der/**dec**oder) comes into play. It handles all the processing that's required to _encode_ (compress) and _decode_ (decompress) the audio data.

Therefore, in order to define the format of an audio file (or a video file for that matter), we need both a container and a codec. For example, when the MPEG-1 Audio Layer 3 codec is used to store only audio data in an <a href="https://en.wikipedia.org/wiki/MPEG-4" target="_blank" rel="noopener noreferrer">MPEG-4</a> container, we get an <a href="https://en.wikipedia.org/wiki/MP3" target="_blank" rel="noopener noreferrer">MP3</a> file (even though it's technically still an MPEG format file).

> Fun fact: a container is not always required!
>
> "<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API " target="_blank" rel="noopener noreferrer">WebRTC</a> does not use a container at all. Instead, it streams the encoded audio and video tracks directly from one peer to another using `MediaStreamTrack` objects to represent each track."--from <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers" target="_blank" rel="noopener noreferrer">MDN web docs</a>

So what does transcoding mean? It's the process of converting one encoding into another. And if we convert one container format into another, this process is called _transmuxing_.

There are a lot of codecs available, and each codec will have a different effect on the _quality_, _size_ and/or _compatibility_ of the audio file. If you'd like to learn more about audio codecs, I recommend reading the <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Audio_codecs" target="_blank" rel="noopener noreferrer">Mozilla web audio codec guide</a>.

### Why do you need to transcode audio?

You might be wondering (like I was), if we can record audio directly in the browser, and immediately use the result in our app, why do we even have to transcode it?<br/>
The answer is to optimize for _compatibility_, because the Media Recording API _cannot record_ audio in all media formats.

For example, MP3 has good compatibility across browsers and devices for playback, but is _not_ supported by the Media Recording API. What formats are supported depend on the browser's specific implementation of the Media Recording API.

We can use the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported" target="_blank" rel="noopener noreferrer">isTypeSupported</a> method to figure out if we can record in a specific media type, by providing it with a <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types" target="_blank" rel="noopener noreferrer">MIME</a> type.<br/>
We can run the following code in the web console (e.g. in Firefox or Chrome) to see it in action:

```js
MediaRecorder.isTypeSupported('audio/mpeg'); // false
```

Okay, MP3 isn't supported. Which format can we use to record in then? It looks like WebM is a good choice:

```js
MediaRecorder.isTypeSupported('audio/webm'); // true
```

Bonus round--you can even specify the codec in addition to the container:

```js
MediaRecorder.isTypeSupported('audio/webm;codecs=opus'); // true
```

So if we want to end up with MP3 files of the recordings, we need to transcode (and technically also transmux) the WebM audio files.

## Transcoding audio

We'll explore two implementations that both transform a WebM audio file into MP3:

- [Using Amazon Elastic Transcoder](#using-amazon-elastic-transcoder).
- [Using FFmpeg + AWS Lambda Layers](#using-ffmpeg--aws-lambda-layers).

For both implementations we'll use the <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">Serverless Framework</a>, and <a href="https://nodejs.org/en/" target="_blank" rel="noopener noreferrer">Node.js</a> to write the code for our <a href="https://aws.amazon.com/lambda/" target="_blank" rel="noopener noreferrer">Lambda</a> functions. Additionally, we'll need two <a href="https://aws.amazon.com/s3/" target="_blank" rel="noopener noreferrer">S3</a> buckets to store audio files:

- An _input_ bucket for the "raw" WebM recordings.
- An _output_ bucket for the transcoded MP3 recordings.

### Using Amazon Elastic Transcoder

This is a fully managed and highly scalable AWS service, and we'll have to go through the following steps to get it up and running:

1. [Create a pipeline.](#1-create-a-pipeline)
2. [Choose a preset.](#2-choose-a-preset)
3. [Create an IAM Policy.](#3-create-an-iam-policy)
4. [Setup a Node.js project.](#4-setup-a-nodejs-project)
5. [Create a Serverless manifest.](#5-create-a-serverless-manifest)
6. [Implement the Lambda function.](#6-implement-the-lambda-function)
7. [Release the Lambda function.](#7-release-the-lambda-function)
8. [Trigger a transcoder job.](#8-trigger-a-transcoder-job)

#### 1. Create a pipeline

In the AWS web console, navigate to the "Elastic Transcoder" service. Select a region (for example Ireland), and click "Create New Pipeline".

<figure>
  <img src="./img/create-pipeline.png" alt="Image of the Elastic Transcoder create pipeline form.">
  <figcaption>Create a pipeline by providing a name, and input- and output buckets.</figcaption>
</figure>

> AWS asks you to provide a bucket for transcoded files and playlists, and thumbnails--you can use the same bucket for both.

Create the pipeline and take note of the "ARN" and "Pipeline ID". We'll need both to configure our Lambda function later on.

<figure>
  <img src="./img/created-pipeline.png" alt="Image of the created Elastic Transcoder pipeline.">
  <figcaption>The created pipeline with its ID and ARN.</figcaption>
</figure>

#### 2. Choose a preset

The pipeline we created in the previous step requires a <a href="https://docs.aws.amazon.com/elastictranscoder/latest/developerguide/working-with-presets.html" target="_blank" rel="noopener noreferrer">preset</a> to work. Presets contain settings we want to be applied during the transcoding process. And lucky for us, AWS already has system presets to create MP3 files.

In the web console, click on "Presets" and filter on keyword "MP3". Select one and take note of the "ARN" and "Preset ID". We'll also need these to configure our Lambda function later on.

<figure>
  <img src="./img/preset.png" alt="Image of the Elastic Transcoder MP3 preset.">
  <figcaption>AWS system preset for MP3 (128k) files.</figcaption>
</figure>

#### 3. Create an IAM Policy

AWS will already have created am IAM Role for you, named `Elastic_Transcoder_Default_Role`. But in order for the pipeline to _read_ the objects in our input bucket, and _write_ objects to our output bucket, we need to make sure the role has the required permissions to do so.

We'll have to create a new _IAM Policy_ with the following configuration:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VisualEditor0",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::raw.recordings/*"
    },
    {
      "Sid": "VisualEditor1",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::transcoded.recordings/*"
    },
    {
      "Sid": "VisualEditor2",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::transcoded.recordings"
    }
  ]
}
```

> Make sure the resource ARNs of your input- and output buckets are named correctly!

After the Policy has been created, attach it to `Elastic_Transcoder_Default_Role`.

#### 4. Setup a Node.js project

Create a new project named "audio-transcoder":

```shell
mkdir audio-transcoder
```

Move to this directory and initialize a new <a href="https://www.npmjs.com/" target="_blank" rel="noopener noreferrer">npm</a> project with:

```shell
npm init -y
```

This creates a `package.json` file in your project root:

```shell
audio-transcoder
  └── package.json # highlight-line
```

We'll use the Serverless Framework to configure and upload the Lambda to AWS, so install it as a "dev" dependency:

```shell
npm i -D serverless
```

#### 5. Create a Serverless manifest

Create a `serverless.yml` file in your project root:

```shell
audio-transcoder
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  └── serverless.yml # highlight-line
```

Add the following content to it:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src
```

We'll add the Elastic Transcoder Pipeline ID, MP3 Preset ID and region (from [step 1](#1-create-a-pipeline) and [step 2](#2-choose-a-preset)) as environment variables:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  # highlight-start
  environment:
    TRANSCODE_AUDIO_PIPELINE_ID: '1572538082044-xmgzaa' # See step 1
    TRANSCODER_MP3_PRESET_ID: '1351620000001-300040' # See step 2
    ELASTIC_TRANSCODER_REGION: 'eu-west-1' # Ireland
  # highlight-end

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src
```

We'll also use the Elastic Transcoder Pipeline ARN and MP3 Preset ARN (from [step 1](#1-create-a-pipeline) and [step 2](#2-choose-a-preset)) to configure our Lambda with the required IAM permissions, so it can create transcoder jobs:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  environment:
    TRANSCODE_AUDIO_PIPELINE_ID: '1572538082044-xmgzaa'
    TRANSCODER_MP3_PRESET_ID: '1351620000001-300040'
    ELASTIC_TRANSCODER_REGION: 'eu-west-1'
  # highlight-start
  iamRoleStatements:
    - Effect: Allow
      Action:
        - elastictranscoder:CreateJob
      Resource:
        - YOUR_PIPELINE_ARN # Replace this with the ARN from step 1
        - YOUR_PRESET_ARN # Replace this with the ARN from step 2
  # highlight-end

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src
```

Finally, we add the Lambda function definition--this Lambda will be executed whenever an object is created in our input bucket:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  environment:
    TRANSCODE_AUDIO_PIPELINE_ID: '1572538082044-xmgzaa'
    TRANSCODER_MP3_PRESET_ID: '1351620000001-300040'
    ELASTIC_TRANSCODER_REGION: 'eu-west-1'
  iamRoleStatements:
    - Effect: Allow
      Action:
        - elastictranscoder:CreateJob
      Resource:
        - YOUR_PIPELINE_ARN
        - YOUR_PRESET_ARN

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

# highlight-start
functions:
  elasticTranscoderToMp3:
    handler: src/handler.elasticTranscoderToMp3
    description: Transcode an audio file to MP3
    events:
      - s3:
          bucket: 'raw.recordings'
          event: 's3:ObjectCreated:*'
          existing: true
# highlight-end
```

This is the minimal configuration you need to get started. But if you'd like to learn more, I recommend you read the <a href="https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/" target="_blank" rel="noopener noreferrer">Serverless manifest</a> and <a href="https://serverless.com/framework/docs/providers/aws/events/s3/" target="_blank" rel="noopener noreferrer">S3 event configuration</a> docs.

#### 6. Implement the Lambda function

In order to match the Lambda function definition in the Serverless manifest, create a file named `handler.js` in `src`:

```shell
audio-transcoder
  ├── node_modules
  ├── package-lock.json
  ├── package.json
  ├── serverless.yml
  └── src
      └── handler.js # highlight-line
```

And in `src/handler.js` export a method named `elasticTranscoderToMp3`:

```js
'use strict';

module.exports.elasticTranscoderToMp3 = async () => {
  try {
    // Implementation goes here
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

In the previous step, we configured our Lambda to be executed whenever an object is created in the input bucket. This means that AWS will call the Lambda with an `event` message that contains a list of `Records`. And each `Record` will contain an `s3` object with information about the `s3:ObjectCreated` event:

```js
// "event" object:
{
  "Records":[
    // "Record" object:
    {
      "s3":{
        // Contains information about the "s3:ObjectCreated" event
      }
    }
  ]
}
```

The `s3` object will contain a property called `key`, which is the "name" of the file that was created in the input bucket.<br/>
For example, if we upload a file named `test.wemb` to the S3 bucket, the value of `key` will be the (URL encoded) string `test.webm`.<br />
You can see the entire event message structure in the <a href="https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html" target="_blank" rel="noopener noreferrer">AWS S3 docs</a>.

Also be aware that you can get **more than one** `Record`--always process all of them:

```js
'use strict';

// highlight-start
module.exports.elasticTranscoderToMp3 = async event => {
  // highlight-end
  try {
    // highlight-start
    for (const Record of event.Records) {
      const { s3 } = Record;
      if (!s3) {
        continue;
      }
      const { object: s3Object = {} } = s3;
      const { key } = s3Object;
      if (!key) {
        continue;
      }
      // Keys are sent as URI encoded strings
      // If keys are not decoded, they will not be found in their buckets
      const decodedKey = decodeURIComponent(key);
      // We'll use the "decodedKey" to tell Amazon Elastic Transcoder
      // which file to transcode
      // highlight-end
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

Now we can initialize the transcoder client:

```js
'use strict';

// highlight-start
const ElasticTranscoder = require('aws-sdk/clients/elastictranscoder');
// highlight-end

// highlight-start
const {
  ELASTIC_TRANSCODER_REGION,
  TRANSCODE_AUDIO_PIPELINE_ID,
  TRANSCODER_MP3_PRESET_ID
} = process.env;
// highlight-end

// highlight-start
const transcoderClient = new ElasticTranscoder({
  region: ELASTIC_TRANSCODER_REGION
});
// highlight-end

module.exports.elasticTranscoderToMp3 = async event => {
  try {
    for (const Record of event.Records) {
      const { s3 } = Record;
      if (!s3) {
        continue;
      }
      const { object: s3Object = {} } = s3;
      const { key } = s3Object;
      if (!key) {
        continue;
      }
      // Keys are sent as URI encoded strings
      // If keys are not decoded, they will not be found in their buckets
      const decodedKey = decodeURIComponent(key);
      // We'll use the "decodedKey" to tell Amazon Elastic Transcoder
      // which file to transcode
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

And schedule a transcoder job for every created S3 object in our input bucket:

```js
'use strict';

const ElasticTranscoder = require('aws-sdk/clients/elastictranscoder');

const {
  ELASTIC_TRANSCODER_REGION,
  TRANSCODE_AUDIO_PIPELINE_ID,
  TRANSCODER_MP3_PRESET_ID
} = process.env;

const transcoderClient = new ElasticTranscoder({
  region: ELASTIC_TRANSCODER_REGION
});

module.exports.elasticTranscoderToMp3 = async event => {
  try {
    for (const Record of event.Records) {
      const { s3 } = Record;
      if (!s3) {
        continue;
      }
      const { object: s3Object = {} } = s3;
      const { key } = s3Object;
      if (!key) {
        continue;
      }
      // Keys are sent as URI encoded strings
      // If keys are not decoded, they will not be found in their buckets
      const decodedKey = decodeURIComponent(key);

      // highlight-start
      await transcoderClient
        .createJob({
          PipelineId: TRANSCODE_AUDIO_PIPELINE_ID,
          Input: {
            Key: decodedKey
          },
          Outputs: [
            {
              Key: decodedKey.replace('webm', 'mp3'),
              PresetId: TRANSCODER_MP3_PRESET_ID
            }
          ]
        })
        .promise();
      // highlight-end
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

You can read more about the `createJob` API in the <a href="https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ElasticTranscoder.html#createJob-property" target="_blank" rel="noopener noreferrer">AWS JavaScript SDK</a> docs.

#### 7. Release the Lambda function

Add a release command to the `package.json` file:

```json
{
  "name": "audio-transcoder",
  "version": "1.0.0",
  "description": "Convert WebM audio into MP3.",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "release": "serverless deploy --region eu-west-1 --stage prod" // highlight-line
  },
  "author": "Daniël Illouz (https://www.danillouz.dev/)",
  "license": "MIT",
  "devDependencies": {
    "serverless": "^1.56.1"
  }
}
```

In order to upload the Lambda to AWS, make sure you have your <a href="https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html" target="_blank" rel="noopener noreferrer">credentials configured</a>, and then run:

```shell
npm run release
```

You should see something like this in your terminal:

```
Serverless: Packaging service...
Serverless: Excluding development dependencies...
Serverless: Installing dependencies for custom CloudFormation resources...
Serverless: Creating Stack...
Serverless: Checking Stack create progress...
.....
Serverless: Stack create finished...
Serverless: Uploading CloudFormation file to S3...
Serverless: Uploading artifacts...
Serverless: Uploading service audio-transcoder.zip file to S3 (68.55 KB)...
Serverless: Uploading custom CloudFormation resources...
Serverless: Validating template...
Serverless: Updating Stack...
Serverless: Checking Stack update progress...
....................................
Serverless: Stack update finished...
Service Information
service: audio-transcoder
stage: prod
region: eu-west-1
stack: audio-transcoder-prod
resources: 10
api keys:
  None
endpoints:
  None
functions:
  elasticTranscoderToMp3: audio-transcoder-prod-elasticTranscoderToMp3
layers:
  None
```

#### 8. Trigger a transcoder job

With everything up and running, we can now upload a WebM audio file to our input bucket. In the AWS web console, navigate to the "S3" service:

- Select your input bucket.
- Click "Upload".
- Add a WebM file.
- Click on "Upload" again.

> If you don't have a WebM file, but would like to try this out, you can use my <a href="./audio/test.webm" download>test.webm</a> file--it's a 3 min. recording of a podcast I was listening to.

This action will trigger an `s3:ObjectCreated` event and AWS will execute the Lambda function we deployed in the previous step, which will schedule a transcoder job.

To get more details about a scheduled job, navigate to the "Elastic Transcoder" service in the AWS web console. Click on "Jobs", select your pipeline and click "Search".

You should see a job, select it for more information.

<figure>
  <img src="./img/created-job.png" alt="Image of the created Elastic Transcoder job.">
  <figcaption>Information about the created pipeline job.</figcaption>
</figure>

If it has status "Complete", we should have a `test.mp3` file in our output bucket!

### Using FFmpeg + AWS Lambda Layers

## In closing

In this post I showed you a way to implement "serverless audio transcoding".
