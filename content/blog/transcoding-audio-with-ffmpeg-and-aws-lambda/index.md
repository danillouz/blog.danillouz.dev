---
title: Transcoding audio with AWS Lambda
date: '2019-10-27T13:35:21.293Z'
description: 'Converting short audio files with Amazon Elastic Transcoder and FFmpeg.'
---

## TL;DR

For my side project I'm converting WebM audio files to MP3. I initially started doing this with <a href="https://aws.amazon.com/elastictranscoder/" target="_blank" rel="noopener noreferrer">Amazon Elastic Transcoder</a>, which works pretty well. But after doing the same with <a href="https://www.ffmpeg.org/" target="_blank" rel="noopener noreferrer">FFmpeg</a> + <a href="https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html" target="_blank" rel="noopener noreferrer">AWS Lambda Layers</a>, my initial testing shows that this implementation is around **10 times cheaper** and **2 times faster** for **short audio** recordings (± 3 minute / 3 MB files).

If you'd like to see the full code of the audio transcoder, go to <a href="https://github.com/upstandfm/audio-transcoder" target="_blank" rel="noopener noreferrer">github.com/upstandfm/audio-transcoder</a>.

### Table of contents

- [Use case](#use-case)
- [What does transcoding even mean?](#what-does-transcoding-even-mean)
- [Using Amazon Elastic Transcoder](#using-amazon-elastic-transcoder)
- [Using FFmpeg + AWS Lambda Layers](#using-ffmpeg--aws-lambda-layers)
- [Comparing costs](#comparing-costs)
- [In closing](#in-closing)

## Use case

I recently started working on a new side project called <a href="https://www.upstand.fm/" target="_blank" rel="noopener noreferrer">Upstand FM</a>. It's a web app that allows you to record your voice, so other users of the app can listen to what you have to say.

In the app I use the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API" target="_blank" rel="noopener noreferrer">MediaStream Recording API</a> (aka Media Recording API) to easily record audio from the user's input device. It works really well, and you don't have to use any external libraries!<br/>
There's one catch though--it only works in Firefox, Chrome and Opera. And at the time of this writing, it "sort of" works in Safari (it's hidden behind a feature flag and not all events are supported). Even though that's a bit disappointing, I'm okay with it for my use case.

So after I had built something functional that allowed me to record my voice, it turned out that the audio file I ended up with had to be _transcoded_ if I wanted to listen to it across a wide range of browsers and devices.

## What does transcoding even mean?

Before I can answer that, we need to explore _what_ an audio file is.

We can think of an audio file like a stream of data elements wrapped in a container. This container is formally called a <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers" target="_blank" rel="noopener noreferrer">media container format</a>, and it's basically a _file format_ (think file type) that can store different types of data elements (bits).<br/>
The container describes how this data "coexists" in a file. Some container formats only support audio, like <a href="https://en.wikipedia.org/wiki/WAV" target="_blank" rel="noopener noreferrer">WAVE</a> (usually referred to as WAV). And others support both audio and video, like <a href="https://www.webmproject.org/" target="_blank" rel="noopener noreferrer">WebM</a>.

So a container "wraps" data to store it in a file, but information can be stored in different ways. And we'll also want to _compress_ the data to optimize for storage and/or bandwith by _encoding_ it (converting it from one "form" to another).<br/>
This is where a _codec_ (**co**der/**dec**oder) comes into play. It handles all the processing that's required to _encode_ (compress) and _decode_ (decompress) the audio data.

Therefore, in order to define the format of an audio file (or a video file for that matter) we need both a container and a codec. For example, when the MPEG-1 Audio Layer 3 codec is used to store only audio data in an <a href="https://en.wikipedia.org/wiki/MPEG-4" target="_blank" rel="noopener noreferrer">MPEG-4</a> container, we get an <a href="https://en.wikipedia.org/wiki/MP3" target="_blank" rel="noopener noreferrer">MP3</a> file (even though it's technically still an MPEG format file).

> Fun fact: a container is not always required!
>
> "<a href="https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API " target="_blank" rel="noopener noreferrer">WebRTC</a> does not use a container at all. Instead, it streams the encoded audio and video tracks directly from one peer to another using `MediaStreamTrack` objects to represent each track."--from <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Containers" target="_blank" rel="noopener noreferrer">MDN web docs</a>

So what does transcoding mean? It's the process of converting one encoding into another. And if we convert one container format into another, this process is called _transmuxing_.

There are a lot of codecs available, and each codec will have a different effect on the _quality_, _size_ and/or _compatibility_ of the audio file. If you'd like to learn more about audio codecs, I recommend reading the <a href="https://developer.mozilla.org/en-US/docs/Web/Media/Formats/Audio_codecs" target="_blank" rel="noopener noreferrer">Mozilla web audio codec guide</a>.

### Why do you need to transcode audio?

You might be wondering (like I was), if we can record audio directly in the browser, and immediately use the result in our app, why do we even have to transcode it?<br/>
The answer is to optimize for _compatibility_, because the Media Recording API _cannot_ record audio in all media formats.

For example, MP3 has good compatibility across browsers and devices for playback, but is _not_ supported by the Media Recording API. What formats are supported depend on the browser's specific implementation of said API.

We can use the <a href="https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported" target="_blank" rel="noopener noreferrer">isTypeSupported</a> method to figure out if we can record in a specific media type by calling it with a <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types" target="_blank" rel="noopener noreferrer">MIME</a> type. Run the following code in the web console (e.g. in Firefox or Chrome) to see it in action:

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

So if we want to end up with MP3 files of the recordings, we need to transcode (and technically also transmux) the WebM audio recordings.

### How will we do this?

We'll explore two implementations that both convert a WebM audio file to MP3:

1. [Using Amazon Elastic Transcoder](#using-amazon-elastic-transcoder)
2. [Using FFmpeg + AWS Lambda Layers](#using-ffmpeg--aws-lambda-layers)

For both implementations we'll use the <a href="https://serverless.com/" target="_blank" rel="noopener noreferrer">Serverless Framework</a>, and <a href="https://nodejs.org/en/" target="_blank" rel="noopener noreferrer">Node.js</a> to write the code for the <a href="https://aws.amazon.com/lambda/" target="_blank" rel="noopener noreferrer">Lambda</a> function that converts an audio file.

Before we get started, make sure you have Node.js installed, and then use <a href="https://www.npmjs.com/" target="_blank" rel="noopener noreferrer">npm</a> to install the Serverless Framework globally:

```shell
npm i -G serverless
```

Additionally, we'll need two <a href="https://aws.amazon.com/s3/" target="_blank" rel="noopener noreferrer">S3</a> buckets to process and store the converted audio files:

- An _input_ bucket to upload WebM audio files.
- An _output_ bucket to store transcoded MP3 files.

## Using Amazon Elastic Transcoder

This is a fully managed and highly scalable AWS service that can be used to transcode audio and video files.

We can use this service to schedule a transcoding _job_ in a _pipeline_. The pipeline knows from which bucket to read a file that needs to be converted, and to which bucket the converted file should be written. Whereas the job contains instructions on which file to transcode, and to what format it should be converted.

We'll go through the following steps to get it up and running:

1. [Create a pipeline](#1-create-a-pipeline)
2. [Choose a preset](#2-choose-a-preset)
3. [Create an IAM Policy](#3-create-an-iam-policy)
4. [Create a Serverless project](#4-create-a-serverless-project)
5. [Implement the Lambda function](#5-implement-the-lambda-function)
6. [Release the Lambda function](#6-release-the-lambda-function)
7. [Schedule a job](#7-schedule-a-job)

### 1. Create a pipeline

Navigate to the Elastic Transcoder service in the AWS web console. Select a region (we'll use EU Ireland), and click on "Create New Pipeline".

<figure>
  <img src="./img/create-pipeline.png" alt="Elastic Transcoder pipeline creation form.">
  <figcaption>Create a pipeline by providing a name, and input/output buckets.</figcaption>
</figure>

Create the pipeline and take note of the ARN and Pipeline ID--we'll need both to configure the Lambda function later on.

<figure>
  <img src="./img/created-pipeline.png" alt="Created Elastic Transcoder pipeline.">
  <figcaption>The created pipeline with its ARN and Pipeline ID.</figcaption>
</figure>

### 2. Choose a preset

The pipeline we created in the previous step requires a <a href="https://docs.aws.amazon.com/elastictranscoder/latest/developerguide/working-with-presets.html" target="_blank" rel="noopener noreferrer">preset</a> to work. Presets contain settings we want to be applied during the transcoding process. And lucky for us, AWS already has system presets to convert to MP3 files.

In the web console, click on "Presets" and filter on the keyword "MP3". Select one and take note of its ARN and Preset ID--we'll also need these to configure the Lambda function.

<figure>
  <img src="./img/preset.png" alt="Elastic Transcoder MP3 (128k) preset.">
  <figcaption>AWS system preset for MP3 (128k).</figcaption>
</figure>

### 3. Create an IAM Policy

AWS will already have created am IAM Role named `Elastic_Transcoder_Default_Role`. But in order for the pipeline to read objects from the input bucket, and write objects to the output bucket, we need to make sure the role has the required permissions to do so.

Create a new IAM _Policy_ with the following configuration:

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

> Make sure the resource ARNs of your input/output buckets are named correctly!

After the Policy has been created, attach it to `Elastic_Transcoder_Default_Role`.

### 4. Create a Serverless project

Create a new project named "audio-transcoder":

```shell
mkdir audio-transcoder
```

Move into this directory and create a `serverless.yml` file in the project root:

```shell
audio-transcoder
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

Add the Elastic Transcoder Pipeline ID, MP3 Preset ID and region (from [step 1](#1-create-a-pipeline) and [step 2](#2-choose-a-preset)) as environment variables:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  # highlight-start
  environment:
    TRANSCODE_AUDIO_PIPELINE_ID: '1572538082044-xmgzaa'
    TRANSCODER_MP3_PRESET_ID: '1351620000001-300040'
    ELASTIC_TRANSCODER_REGION: 'eu-west-1' # EU Ireland
  # highlight-end

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src
```

Use the Elastic Transcoder Pipeline ARN and MP3 Preset ARN (from [step 1](#1-create-a-pipeline) and [step 2](#2-choose-a-preset)) to configure the Lambda with the required IAM permissions, so it can create transcoder jobs:

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

Finally, add the Lambda function definition--this Lambda will be executed whenever an object is created in the input bucket:

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
  transcodeToMp3:
    handler: src/handler.transcodeToMp3
    description: Transcode an audio file to MP3
    events:
      - s3:
          bucket: 'raw.recordings'
          event: 's3:ObjectCreated:*'
          existing: true
# highlight-end
```

This is the minimal configuration needed to get started. But if you'd like to learn more, I recommend you read the <a href="https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/" target="_blank" rel="noopener noreferrer">Serverless manifest</a> and <a href="https://serverless.com/framework/docs/providers/aws/events/s3/" target="_blank" rel="noopener noreferrer">S3 event configuration</a> docs.

### 5. Implement the Lambda function

In order to match the Lambda function definition in the Serverless manifest, create a file named `handler.js` in `src`:

```shell
audio-transcoder
  ├── serverless.yml
  └── src
      └── handler.js # highlight-line
```

And in `src/handler.js` export a method named `transcodeToMp3`:

```js
'use strict';

module.exports.transcodeToMp3 = async () => {
  try {
    // Implementation goes here
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

In the previous step we configured the Lambda to be executed whenever an object is created in the input bucket. This means that AWS will call the Lambda with an `event` message that contains a list of `Records`. And each `Record` will contain an `s3` object with information about the `s3:ObjectCreated` event:

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

The `s3` object will contain a property called `key`, which is the "name" of the file that was created in the input bucket. For example, if we upload a file named `test.wemb` to the S3 bucket, the value of `key` will be the (URL encoded!) string `test.webm`.<br />
You can see the entire event message structure in the <a href="https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html" target="_blank" rel="noopener noreferrer">AWS S3 docs</a>.

Also be aware that you can get **more than one** `Record`--always process all of them:

```js
'use strict';

// highlight-start
module.exports.transcodeToMp3 = async event => {
  // highlight-end
  try {
    // highlight-start
    for (const Record of event.Records) {
      const { s3 } = Record;
      if (!s3) {
        continue;
      }
      // highlight-end

      // highlight-start
      const { object: s3Object = {} } = s3;
      const { key } = s3Object;
      if (!key) {
        continue;
      }
      // highlight-end

      // highlight-start
      const decodedKey = decodeURIComponent(key);
      // highlight-end
      // TODO: use "decodedKey" to transcode file
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

Now initialize the transcoder client:

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

module.exports.transcodeToMp3 = async event => {
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

      const decodedKey = decodeURIComponent(key);
      // TODO: use "decodedKey" to transcode file
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

And finally, schedule a transcoder job for every created object in the input bucket:

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

module.exports.transcodeToMp3 = async event => {
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

### 6. Release the Lambda function

In order to upload the Lambda to AWS, make sure you have your <a href="https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html" target="_blank" rel="noopener noreferrer">credentials configured</a>, and then run the following command from the project root:

```shell
sls deploy --region eu-west-1 --stage prod
```

### 7. Schedule a job

With everything up and running, we can now upload a WebM audio file to the input bucket to schedule a transcoder job. Navigate to the S3 service in the AWS web console:

- Select your input bucket.
- Click "Upload".
- Add a WebM audio file.
- Click on "Upload" again.

> If you don't have a WebM file you can use this <a href="./audio/test.webm" download>test.webm</a> file--it's a 3 minute (2,8 MB) recording of a podcast I was listening to.

This action will trigger an `s3:ObjectCreated` event. AWS will execute the Lambda function we deployed in the previous step, and it will schedule a transcoder job.

To get more information about a scheduled job, navigate to the Elastic Transcoder service in the AWS web console. Click on "Jobs", select your pipeline and click "Search". Here you can select a job to get more details about it.

<figure>
  <img src="./img/created-job.png" alt="Information about the scheduled Elastic Transcoder job.">
  <figcaption>Information about the scheduled job.</figcaption>
</figure>

If it has status "Complete", there should be a file named `test.mp3` in the output bucket!

## Using FFmpeg + AWS Lambda Layers

FFmpeg is a cross-platform solution that can be used to convert audio and video files. And since it's a binary, we'll use a Lambda Layer to execute it from the Lambda function.

### What's a Lambda Layer?

Lambda Layers allow us to "pull in" extra dependencies into Lambda functions. A layer is basically a ZIP archive that contains some code. And in order to use a layer, we first must create and publish one.

After we publish a layer, we can configure any Lambda function to use it. AWS will then extract the layer to a special directory called `/opt`. And the Lambda function runtime will be able to execute it.

> "A Lambda function can use up to 5 layers at a time."--from <a href="https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html" target="_blank" rel="noopener noreferrer">Lambda Layers docs</a>

### How different is this implementation?

Because we're still converting a WebM audio file to MP3 whenever it's uploaded to the input bucket, we can "reuse" the Serverless project from the previous implementation by making a few changes:

- Replace Amazon Elastic Transcoder with FFmpeg.
- Retrieve the WebM audio file from the input bucket whenever it's uploaded.
- Convert the retrieved WebM audio file to MP3 using FFmpeg.
- Write the converted MP3 file to the output bucket.

We'll apply these changes by going through the following steps:

1. [Create and publish FFmpeg Lambda Layer](#1-create-and-publish-ffmpeg-lambda-layer)
2. [Update the Serverless manifest](#2-update-the-serverless-manifest)
3. [Update the Lambda function](#3-update-the-lambda-function)
4. [Release the updated Lambda function](#4-release-the-updated-lambda-function)
5. [Upload another WebM audio file](#5-upload-another-webm-audio-file)
6. [Optimize the Lambda function](#6-optimize-the-lambda-function)

### 1. Create and publish FFmpeg Lambda Layer

The Serverless Framework makes it very easy to work with layers. To get started, create a new project named "lambda-layers":

```shell
mkdir lambda-layers
```

Move to this directory and create a `serverless.yml` file in the project root:

```shell
lambda-layers
  └── serverless.yml # highlight-line
```

Add the following content to it:

```yml
service: lambda-layers

provider:
  name: aws
  runtime: nodejs10.x

package:
  exclude:
    - ./*
  include:
    - layers

layers:
  ffmpeg:
    path: layers
    description: FFmpeg binary
    compatibleRuntimes:
      - nodejs10.x
    licenseInfo: GPL v2+, for more info see https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md
```

The layer is named `ffmpeg` and the `path` propery dictates that the layer code will reside in a directory named `layers`. Match this structure in the project:

```shell
mkdir layers
```

Move into this directory and download a static build of FFmpeg from <a href="https://johnvansickle.com/ffmpeg/" target="_blank" rel="noopener noreferrer">johnvansickle.com/ffmpeg</a>.

> These FFmpeg builds are all compatible with Amazon Linux 2--the operating system on which Lambda runs when the `Node.js 10.x` <a href="https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html" target="_blank" rel="noopener noreferrer">runtime</a> is used.

Use the recommended `ffmpeg-git-amd64-static.tar.xz` master build:

```shell
curl -O https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz
```

Extract the files from the downloaded archive:

```shell
tar -xvf ffmpeg-git-amd64-static.tar.xz
```

Remove the downloaded archive:

```shell
rm ffmpeg-git-amd64-static.tar.xz
```

And rename the extracted directory to `ffmpeg`, so it matches the configured layer name in the Serverless manifest. For example:

```shell
mv ffmpeg-git-20191029-amd64-static ffmpeg
```

You should now have the following folder structure:

```shell
lambda-layers
  ├── layers # highlight-line
  │   └── ffmpeg # highlight-line
  │       ├── GPLv3.txt
  │       ├── ffmpeg # highlight-line
  │       ├── ffprobe
  │       ├── manpages
  │       ├── model
  │       ├── qt-faststart
  │       └── readme.txt
  └── serverless.yml
```

Now publish the layer by running the following command from the project root:

```shell
sls deploy --region eu-west-1 --stage prod
```

When Serverless finishes deploying, navigate to the Lambda service in the AWS web console, and click on "Layers". Here you should see the published layer. Click on it and take note of the ARN, we'll need it in the next step.

<figure>
  <img src="./img/published-layer.png" alt="Published FFmpeg layer.">
  <figcaption>Information about the published FFmpeg layer.</figcaption>
</figure>

### 2. Update the Serverless manifest

> Note that we'll now be modifying the manifest file of the **audio transcoder** project!

First modify the environment variables, and add the names of your input- and output buckets:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  environment:
    S3_INPUT_BUCKET_NAME: 'raw.recordings' # highlight-line
    S3_OUTPUT_BUCKET_NAME: 'transcoded.recordings' # highlight-line
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

functions:
  transcodeToMp3:
    handler: src/handler.transcodeToMp3
    description: Transcode an audio file to MP3
    events:
      - s3:
          bucket: 'raw.recordings'
          event: 's3:ObjectCreated:*'
          existing: true
```

Then modify the IAM permissions, so the Lambda function can read from the input bucket, and write to the output bucket:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  environment:
    S3_INPUT_BUCKET_NAME: 'raw.recordings'
    S3_OUTPUT_BUCKET_NAME: 'transcoded.recordings'
  iamRoleStatements:
    # highlight-start
    - Effect: Allow
      Action:
        - s3:GetObject
      Resource: arn:aws:s3:::raw.recordings/*
    - Effect: Allow
      Action:
        - s3:PutObject
      Resource: arn:aws:s3:::transcoded.recordings/*
    # highlight-end

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

functions:
  transcodeToMp3:
    handler: src/handler.transcodeToMp3
    description: Transcode an audio file to MP3
    events:
      - s3:
          bucket: 'raw.recordings'
          event: 's3:ObjectCreated:*'
          existing: true
```

Finally, configure the Lambda function to use the FFmpeg layer with the ARN from the [previous step](#1-create-and-publish-ffmpeg-lambda-layer):

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  environment:
    S3_INPUT_BUCKET_NAME: 'raw.recordings'
    S3_OUTPUT_BUCKET_NAME: 'transcoded.recordings'
  iamRoleStatements:
    - Effect: Allow
      Action:
        - s3:GetObject
      Resource: arn:aws:s3:::raw.recordings/*
    - Effect: Allow
      Action:
        - s3:PutObject
      Resource: arn:aws:s3:::transcoded.recordings/*

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

functions:
  transcodeToMp3:
    handler: src/handler.transcodeToMp3
    description: Transcode an audio file to MP3
    events:
      - s3:
          bucket: 'raw.recordings'
          event: 's3:ObjectCreated:*'
          existing: true
    # highlight-start
    layers:
      - YOUR_FFMPEG_LAYER_ARN # Replace this with the ARN from step 1
    # highlight-end
```

### 3. Update the Lambda function

Since we have to read from the input bucket, and write to the output bucket, replace the Elastic Transcoder client with the S3 client:

```js
'use strict';

// highlight-start
const S3 = require('aws-sdk/clients/s3');
const { S3_INPUT_BUCKET_NAME, S3_OUTPUT_BUCKET_NAME } = process.env;
const s3Client = new S3();
// highlight-end

module.exports.transcodeToMp3 = async event => {
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

      const decodedKey = decodeURIComponent(key);
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
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

Then use the `decodedKey` to get the WebM recording from the input bucket:

```js
'use strict';

const S3 = require('aws-sdk/clients/s3');
const { S3_INPUT_BUCKET_NAME, S3_OUTPUT_BUCKET_NAME } = process.env;
const s3Client = new S3();

module.exports.transcodeToMp3 = async event => {
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

      const decodedKey = decodeURIComponent(key);
      // highlight-start
      const webmRecording = await s3Client
        .getObject({
          Bucket: S3_INPUT_BUCKET_NAME,
          Key: decodedKey
        })
        .promise();
      // highlight-end
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

The S3 client returns an object that contains a `Body` property. The value of `Body` is a blob, which we'll feed to the FFmpeg layer and convert it to MP3.

Create a helper module called `ffmpeg.js` in `src`:

```shell
audio-transcoder
  ├── serverless.yml
  └── src
      ├── ffmpeg.js # highlight-line
      └── handler.js
```

And export an object with a method called `convertWebmToMp3`, which receives the WebM blob as an argument:

```js
'use strict';

module.exports = {
  convertWebmToMp3(webmBlob) {
    // Implementation goes here
  }
};
```

This module will spawn a <a href="https://nodejs.org/api/child_process.html#child_process_child_process_spawnsync_command_args_options" target="_blank" rel="noopener noreferrer">synchronous child process</a> that allows us to execute the `ffmpeg` "command" (provided by the FFmpeg layer):

```js
'use strict';

const { spawnSync } = require('child_process'); // highlight-line

module.exports = {
  convertWebmToMp3(webmBlob) {
    // highlight-start
    spawnSync(
      '/opt/ffmpeg/ffmpeg', // "/opt/:LAYER_NAME/:BINARY_NAME"
      [
        /* FFmpeg command arguments go here */
      ],
      { stdio: 'inherit' }
    );
    // highlight-end
  }
};
```

The `ffmpeg` command requires the file system to do its magic. And we'll use a "special" directory called `/tmp` for this.

> The `/tmp` directory allows you to **temporarily** store up to <a href="https://docs.aws.amazon.com/lambda/latest/dg/limits.html" target="_blank" rel="noopener noreferrer">512 MB</a>.

First write the WebM blob to `/tmp` so FFmpeg can read it, and then tell it to write the produced MP3 file back to the same directory:

```js
'use strict';

const { spawnSync } = require('child_process');
const { writeFileSync } = require('fs'); // highlight-line

module.exports = {
  convertWebmToMp3(webmBlob) {
    // highlight-start
    const now = Date.now();
    const input = `/tmp/${now}.webm`;
    const output = `/tmp/${now}.mp3`;
    // highlight-end

    // highlight-start
    writeFileSync(input, webmBlob);
    // highlight-end

    // highlight-start
    spawnSync('/opt/ffmpeg/ffmpeg', ['-i', input, output], {
      stdio: 'inherit'
    });
    // highlight-end
  }
};
```

Now read the produced MP3 file from disk, clean `/tmp`, and return the MP3 blob:

```js
'use strict';

const { spawnSync } = require('child_process');
const { readFileSync, writeFileSync, unlinkSync } = require('fs'); // highlight-line

module.exports = {
  convertWebmToMp3(webmBlob) {
    const now = Date.now();
    const input = `/tmp/${now}.webm`;
    const output = `/tmp/${now}.mp3`;

    writeFileSync(input, webmBlob);

    spawnSync('/opt/ffmpeg/ffmpeg', ['-i', input, output], {
      stdio: 'inherit'
    });

    // highlight-start
    const mp3Blob = readFileSync(output);
    // highlight-end

    // highlight-start
    unlinkSync(input);
    unlinkSync(output);
    // highlight-end

    // highlight-start
    return mp3Blob;
    // highlight-end
  }
};
```

Finally, use the MP3 blob to write it to the output bucket:

```js
'use strict';

const S3 = require('aws-sdk/clients/s3');
const ffmpeg = require('./ffmpeg'); // highlight-line
const { S3_INPUT_BUCKET_NAME, S3_OUTPUT_BUCKET_NAME } = process.env;
const s3Client = new S3();

module.exports.transcodeToMp3 = async event => {
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

      const decodedKey = decodeURIComponent(key);
      const webmRecording = await s3Client
        .getObject({
          Bucket: S3_INPUT_BUCKET_NAME,
          Key: decodedKey
        })
        .promise();

      // highlight-start
      const mp3Blob = ffmpeg.convertWebmToMp3(webmRecording.Body);
      await s3Client
        .putObject({
          Bucket: S3_OUTPUT_BUCKET_NAME,
          Key: decodedKey.replace('webm', 'mp3'),
          ContentType: 'audio/mpeg',
          Body: mp3Blob
        })
        .promise();
      // highlight-end
    }
  } catch (err) {
    console.log('Transcoder Error: ', err);
  }
};
```

### 4. Release the updated Lambda function

Run the same command like before from the project root:

```shell
sls deploy --region eu-west-1 --stage prod
```

### 5. Upload another WebM audio file

When Serverless is done deploying, upload another WebM audio file to the input bucket. But why does the output bucket remain empty? Where's the MP3 file?

Lets find out why this is happening by checking the Lambda function's log files in the AWS web console:

- Go to the Lambda service.
- Click on the `audio-transcoder-prod-transcodeToMp3` function.
- Click on the "Monitoring" tab.
- Click the "View logs in CloudWatch" button.
- Select the latest log group.

Here you should see the logs of the Lambda function:

<figure>
  <img src="./img/logs-timeout.png" alt="CloudWatch logs of the Lambda function that's timing out.">
  <figcaption>The Lambda function stops executing after ± 6 seconds.</figcaption>
</figure>

The logs tell us that FFmpeg is executing (hooray!) but that it doesn't complete (booo!). In the middle of the transcoding process the logs just say "END", and on the last line we see that the Lambda had a duration of `6006.17 ms`.

What's happening? The Lambda function takes "too long" to finish executing--by default Lambda has a timeout of 6 seconds (at the time of this writing it can be set to a maximum of <a href="https://docs.aws.amazon.com/lambda/latest/dg/limits.html" target="_blank" rel="noopener noreferrer">900 seconds</a>).<br/>
In other words, because of the default timeout, after 6 seconds the Lambda function is still not done transcoding, and AWS _terminates_ it.

How do we solve this? By optimizing the Lambda function!

### 6. Optimize the Lambda function

First lets just set the timeout to a larger value (for example 180 seconds) so we can see how long it would actually take to complete the transcoding process:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  environment:
    S3_INPUT_BUCKET_NAME: 'raw.recordings'
    S3_OUTPUT_BUCKET_NAME: 'transcoded.recordings'
  iamRoleStatements:
    - Effect: Allow
      Action:
        - s3:GetObject
      Resource: arn:aws:s3:::raw.recordings/*
    - Effect: Allow
      Action:
        - s3:PutObject
      Resource: arn:aws:s3:::transcoded.recordings/*

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

functions:
  transcodeToMp3:
    handler: src/handler.transcodeToMp3
    description: Transcode an audio file to MP3
    timeout: 180 # highlight-line
    events:
      - s3:
          bucket: 'raw.recordings'
          event: 's3:ObjectCreated:*'
          existing: true
    layers:
      - YOUR_FFMPEG_LAYER_ARN
```

Deploy again, and when Serverless is done, upload another WebM audio file, and check the logs:

<figure>
  <img src="./img/logs-complete.png" alt="CloudWatch logs of the Lambda function that finishes executing.">
  <figcaption>The Lambda function finishes executing after ± 7 seconds.</figcaption>
</figure>

This time we see FFmpeg completes the transcoding process and that the Lambda had a duration of `7221.95 ms`. If we check the output bucket now, we'll see the MP3 file!

#### Optimizing further

Transcoding the audio file in ± 7 seconds isn't bad. Actually, it's very similar to the Amazon Elastic Transcoder service. But perhaps we can do better..

Something that's very important when working with Lambda, is to _always_ performance test your functions. Or in other words, always make sure that a Lambda function has the _optimum_ memory size configured.

This is important, because when you choose a higher memory setting, AWS will also give you an equivalent CPU boost! And this will (usually) positively impact the Lambda function's runtime duration--which means we can save costs.

> In general, a Lambda function's **memory** and **duration** are the main factors that affect its costs.

By default a Lambda function has a memory setting of 1024 MB, so lets double it and compare results:

```yml
service: audio-transcoder

provider:
  name: aws
  runtime: nodejs10.x
  environment:
    S3_INPUT_BUCKET_NAME: 'raw.recordings'
    S3_OUTPUT_BUCKET_NAME: 'transcoded.recordings'
  iamRoleStatements:
    - Effect: Allow
      Action:
        - s3:GetObject
      Resource: arn:aws:s3:::raw.recordings/*
    - Effect: Allow
      Action:
        - s3:PutObject
      Resource: arn:aws:s3:::transcoded.recordings/*

package:
  exclude:
    - ./*
    - ./**/*.test.js
  include:
    - node_modules
    - src

functions:
  transcodeToMp3:
    handler: src/handler.transcodeToMp3
    description: Transcode an audio file to MP3
    timeout: 180
    memorySize: 2048 # highlight-line
    events:
      - s3:
          bucket: 'raw.recordings'
          event: 's3:ObjectCreated:*'
          existing: true
    layers:
      - YOUR_FFMPEG_LAYER_ARN
```

Deploy again, and when Serverless is done, upload another WebM audio file and check the logs:

<figure>
  <img src="./img/logs-double-memory.png" alt="CloudWatch logs of the Lambda function with twice the memory.">
  <figcaption>The Lambda function with 2048 MB of memory completes in ± 4 seconds.</figcaption>
</figure>

Great, it's even faster now! Does this mean we can just keep increasing the memory and reap the benefits? Sadly no--there's a tipping point where increasing the memory wont make it run faster.

For example, increasing the memory to 3008 MB (the maximum <a href="https://docs.aws.amazon.com/lambda/latest/dg/limits.html" target="_blank" rel="noopener noreferrer">memory limit</a> at the time of this writing) will result in almost the same runtime duration:

##### Memory: 2048 MB

| Test run | Duration     | Billed Duration | Cold Start Duration |
| -------- | ------------ | --------------- | ------------------- |
| 1        | `3775,63 ms` | `3800 ms`       | `392,59 ms`         |
| 2        | `3604,71 ms` | `3700 ms`       | -                   |
| 3        | `3682,62 ms` | `3700 ms`       | -                   |
| 4        | `3677,14 ms` | `3700 ms`       | -                   |
| 5        | `3725,77 ms` | `3800 ms`       | -                   |

##### Memory: 3008 MB

| Test run | Duration     | Billed Duration | Cold Start Duration |
| -------- | ------------ | --------------- | ------------------- |
| 1        | `4125,12 ms` | `4200 ms`       | `407,92 ms`         |
| 2        | `3767,79 ms` | `3800 ms`       | -                   |
| 3        | `3736,06 ms` | `3800 ms`       | -                   |
| 4        | `3662,68 ms` | `3700 ms`       | -                   |
| 5        | `3717,01 ms` | `3800 ms`       | -                   |

> When done optimizing, make sure to apply a sensible value for the Lambda timeout. In this case the default of 6 seconds would be a good one.

## Comparing costs

To compare costs between both implementation, I did a couple of test runs converting a 3 minute (2,8 MB) WebM audio file to MP3.

The following comparison is by no means very extensive, and your mileage may vary. But IMHO I think it's good enough to get a decent impression of the cost range.

I haven't run this implementation at scale yet (\*fingers crossed\*), and if my findings change, I'll update this post.

### Amazon Elastic Transcoder costs

The <a href="https://aws.amazon.com/elastictranscoder/pricing/" target="_blank" rel="noopener noreferrer">pricing</a> page tells us we pay per minute (with 20 free minutes every month). And when we only transcode audio in region EU Ireland, we'll currently pay `$0.00522` per minute transcoding time.

These are the timing results of the test runs:

| Test run | Transcoding Time |
| -------- | ---------------- |
| 1        | `7638 ms`        |
| 2        | `6663 ms`        |
| 3        | `7729 ms`        |
| 4        | `6595 ms`        |
| 5        | `8752 ms`        |
| 6        | `7216 ms`        |
| 7        | `7167 ms`        |
| 8        | `6605 ms`        |
| 9        | `6718 ms`        |
| 10       | `8700 ms`        |

So the average transcoding time of the audio file would be:

```
7638 + 6663 + 7729 + 6595 + 8752 + 7216 + 7167 + 6605 + 6718 + 8700 = 73783 ms

73783 / 10 = 7378,3 ms

7378,3 / 1000 = 7,3783 sec
```

Lets say we would be transcoding `100 000` of these audio files per month, that would amount to a total transcoding time of:

```
7,3783 * 100 000 = 737 830 sec

737 830 / 60 = 12297,166 666 667 min
```

Since we pay `$0,00522` per minute, the costs without free tier would be:

```
12297,166 666 667 * 0,00522 = $64,191 21
```

And with free tier it would cost:

```
(12297,166 666 667 - 20) * 0,00522 = $64,086 81
```

#### What about Lambda costs?

We're using Lambda to schedule Amazon Elastic Transcoder jobs. So we also have to calculate those (minor if not negligible) costs.

The Lambda <a href="https://aws.amazon.com/lambda/pricing/" target="_blank" rel="noopener noreferrer">pricing</a> page tells us we pay for the **number of requests** and the **duration** (depends on memory setting).

> We get 1 million requests for free every month, and after that you pay `$0.20` per 1 million requests. Since, we're only doing 1/10th of that in this example, I'm not including it in the calculations.

These are the Lambda durations (with 128 MB memory) for the accompanying transcoder test runs:

| Test run | Duration    | Billed Duration | Cold Start Duration |
| -------- | ----------- | --------------- | ------------------- |
| 1        | `494,08 ms` | `500 ms`        | `401,61 ms`         |
| 2        | `185,01 ms` | `200 ms`        | -                   |
| 3        | `168,29 ms` | `200 ms`        | -                   |
| 4        | `165,29 ms` | `200 ms`        | -                   |
| 5        | `184,89 ms` | `200 ms`        | -                   |
| 6        | `210,19 ms` | `300 ms`        | -                   |
| 7        | `162,64 ms` | `200 ms`        | -                   |
| 8        | `178,79 ms` | `200 ms`        | -                   |
| 9        | `318,84 ms` | `400 ms`        | -                   |
| 10       | `206,18 ms` | `300 ms`        | -                   |

The average _billed duration_ would be:

```
500 + 200 + 200 + 200 + 200 + 300 + 200 + 200 + 400 + 300 = 2700 ms

2700 / 10 = 270 ms

270 / 1000 = 0,27 sec
```

In region EU Ireland, we'll currently pay `$0,000 016 6667` for every GB per second (GB/sec). That means we first have to calculate "how much" memory the Lambda function uses for its runtime duration.

For `100 000` transcoding jobs per month (with 128 MB memory) that would be:

```
100 000 * 0,27 = 27000 sec

(128 / 1024) * 27000 = 3375 GB/sec
```

> Currently you get `400 000` GB/sec for free every month, so depending on your scale you may or may not have to include it in your calculations.

Without free tier it would cost:

```
3375 * 0,000 016 6667 = $0,056 250 113
```

### FFmpeg + Lambda Layers costs

These are the Lambda durations (with 2048 MB memory) of the test runs:

| Test run | Duration     | Billed Duration | Cold Start Duration |
| -------- | ------------ | --------------- | ------------------- |
| 1        | `4068,56 ms` | `4100 ms`       | `408,17 ms`         |
| 2        | `3880,55 ms` | `3900 ms`       | -                   |
| 3        | `3910,52 ms` | `4000 ms`       | -                   |
| 4        | `3794,20 ms` | `3800 ms`       | -                   |
| 5        | `3856,73 ms` | `3900 ms`       | -                   |
| 6        | `3859,06 ms` | `3900 ms`       | -                   |
| 7        | `3810,93 ms` | `3900 ms`       | -                   |
| 8        | `3799,19 ms` | `3800 ms`       | -                   |
| 9        | `3858,49 ms` | `3900 ms`       | -                   |
| 10       | `3866,53 ms` | `3900 ms`       | -                   |

The average _billed duration_ would be:

```
4100 + 3900 + 4000 + 3800 + 3900 + 3900 + 3900 + 3800 + 3900 + 3900 = 39100 ms

39100 / 10 = 3910 ms

3910 / 1000 = 3,91 sec
```

In region EU Ireland, we'll currently pay `$0,000 016 6667` for every GB/sec.<br/>
For `100 000` transcoding jobs (with 2048 MB memory) that would be:

```
100 000 * 3,91 = 391 000 sec

(2048 / 1024) * 391 000 = 782 000 GB/sec
```

Without free tier it would cost:

```
782 000 * 0,000 016 6667 = $13,033 3594
```

With free tier it would cost:

```
(782 000 - 400 000) * 0,000 016 6667 = $6,366 6794
```

### What about data transfer costs?

If possible, keep your infrastructure in the same region to avoid data transfer costs.

> "Data transferred between S3, Glacier, DynamoDB, SES, SQS, Kinesis, ECR, SNS, or SimpleDB and Lambda functions **in the same AWS Region is free**."--from <a href="https://aws.amazon.com/lambda/pricing/" target="_blank" rel="noopener noreferrer">Lambda pricing page</a>

Otherwise, data transferred into- and out of Lambda functions will be charged at the <a href="https://aws.amazon.com/ec2/pricing/on-demand/" target="_blank" rel="noopener noreferrer">EC2 data transfer rates</a> as listed under the “Data transfer” section.

## In closing

In this post I showed you a way to implement "serverless audio transcoding".
