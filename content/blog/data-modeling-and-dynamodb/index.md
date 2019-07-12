---
title: Data modeling and DynamoDB
date: '2019-07-12T16:40:59.664Z'
description: 'Best practices for modeling your data the NoSQL way, when working with DynamoDB.'
---

Intro.

<a href="" target="_blank" rel="noopener noreferrer">link</a>

### Table of contents

- [Topic](#)
- [In closing](#in-closing)

## History

Based on Dynamo paper..

## Types of DBs

Relational, Key-Value, Document, Graph, Ledger, Time Series, Search

## SQL vs NoSQL

Normalization vs denormalization

## Terminology

In DynamoDB data is organized in a **table**, which contains many **items** and each item consists of **attributes**.

<figure>
  <img src="./img/table.png" alt="Visualizing a DynamoDB table.">
  <figcaption>DynamoDB items are analogous to rows in a relational table. And attributes to columns.</figcaption>
</figure>

At the time of this writing you can have a maximum of `256` tables per region. Where a table can have unlimited items, but a single item may not exceed `400 KB` in size. And attributes can only be nested to a maximum of `32` levels deep.

An item is _schemaless_, with the exception of the **primary key**, which uniquely identifies an item in the table. Here the primary key can be:

- "simple": meaning its just a single attribute, like `item_id`. This single attribute is reffered to as the **partition key** (or partition attribute).
- "composite": meaning it consists of two attributes, like `item_id` and `creation_date`. Here the second attribute is referred to as a **sort key** (or sort attribute).

The paritition key is sometimes referred to as the **hash key** (or hash attribute). Because the value of the partition key is provided as the input to an internal hash function. The output hash of this function then determines the physical storage partition of the item.
Additionally, the sort key is sometimes referred to as the **range key** (or range attribute). Because items with the same hash key are stored physically close together, and then sorted per partition.

Something that might not be totally obvious when starting out with DynamoDB, is that you can _only_ get and query items by partition key! And if you need to retrieve one or more items by another attribute, you need to create a secondary index.

## Secondary Indexes

GSI, LSI

## CRUD

Put, Query, Scan, Update, Delete

## How to model data

Workflow

1:1
1:N
N:M
Hierarchical
Graph

## Internals

## Provisioning and Capacity

## Streams

## Example

## In closing
