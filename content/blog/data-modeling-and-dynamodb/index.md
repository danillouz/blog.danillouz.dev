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

### Relational

Emerged in the 70s when storage was expensive.
It's good for when you do not know all questions that might be asked of the data.
And when the data must be high integrity, highly consistent. Or in other words, when referential integrity must be preserved by means of data accuracy and consistency.

## Key-Value, Document

Good for horizontal partitioning.
High throughput and low latency reads and writes.
Consistent performance at scale.

## Graph

Higly connected data where relationships are first class.

## Ledger

Track event data over time where data has to be immutable and cryptographically verifiable.

## Time Series

Sequence of data points recorded over a time interval (metrics).
Time is the single axis of the data model.
When you need time interpolation for missing data points (predictions).

## Search

## SQL vs NoSQL

Normalization vs denormalization

Relational databases reduce the footprint of data on disk by normalization.
This reduces storage costs, but increases CPU (joins).

Normalized data is good for:

- Vertical scaling
- OLAP (Ad hoc access patterns)

Denormalized (hierarchical) data is good for:

- Instantiated views
- Horizontal scaling
- OLTP (well, known, repeatable, consistent access patterns)

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

### Good primary key

A good primary key has a large number of distinct values (high cardinality). Where values are requested in a fairly uniform way, i.e. evenly over time (as random as possible).
This will avoid "hot partitions" and increase throughput.

## Secondary Indexes

RDBMS have a query optimizer. This is a component that automatically evaluates available indexes to determine if a query can be "sped up". DynamoDB doesn't have this, and you have to query on the index directly by specifying the index name.

DynamoDB has support for secondary indexes, which allow you to query on a key _other_ that the primary key. There're two types:

- Local Secondary Indexes (LSI): same primary key, different sort key.
- Global Secondary Indexes (GSI): different primary key and sort key.

The LSI allows you to "resort" your data to support different access patterns. And it supports strongly consistent writes and reads. The LSI is used to model `1:N` and `N:M` relationships.

The GSI allows you to "regroup" your data to support even more different access patterns.
When you create a GSI, DynamoDB creates a new table for you. The new table is a projection of the original table, i.e. the **base table**. And by default the primary key attributes are projected to the new table (the GSI), but you can specify which attributes are projected.
DynamoDB replicates all changes that happen in the base table to the GSI, and that's why the GSI only supports eventual consistent writes and reads.
Because the GSI is essentially a new table, it also has its own capacity requirements in terms of reads and writes (WCUs and RCUs). Make sure it has enought read and write capacity, otherwise you may be throttled.

At the time of this writing, you can have a maximum of 5 LSIs, where each LSI can have a maximum size of `10 GB` (size of a partition). And a maximum of 20 GSIs.

## CRUD

Put, Query, Scan, Update, Delete

An update works like an upsert and supports conditional writes and atomic counters (`SET plays = plays + :incr`).

Delete supports conditional deletes.

## How to model data

Workflow:

### 1. Use case

- What is the nature of the application?
- OLAP? OLTP?
- Define an ER model
- Identify the data life cycle (ttl, backup, etc.)

### 2. Define access patterns

- Is it read and/or write heavy?
- Identify data sources, queries and document these.

### 3. Model data

- In general use 1 table for a single application to reduce round trips and simplify queries.
- Identify the primary keys:
  - How will items be inserted and read?
  - Overload items into partitions.
- Define indexes for secondary access patterns.

### 4. Review

Review, repeat, review.

1:1
1:N
N:M
Hierarchical
Graph

## Design Patterns

### Write sharding

Distribute the load by randomizing the primary key (all data), or create your own hash range (specific data).

### Optimize queries

Concatenate attributes, for example a composite sort key.

Use a sparse index. GSI are sparse indexes by default.
A sparse index is only added to the index when the key is provided.

### Vertical partitioning

Good for dealing with large docs. You can then split data into multiple tables.

### Hierarchical data

A query filter can be used to reduce the result set, but its applied _after_ a read.
When there's a lot of data that doesn't match a query filter, use composite sort keys.

For example when filtering on status, where the partition key is the user's id and the sort key is the date, you might get back a lot of data because you query on the primary key. But if you make the sort key a composite key that consist of the date _and_ status (`status_date -> DONE_2019-07-13`), you can efficiently query on the primary key and apply a filter condition on the sort key (begins with status done).

### Adjacency lists

Good to model simple grahps, `1:N` and `N:M` data.
Paritition on node, i.e. `id` and add edges to define all relationships.
Make sure to define an edge for every node to describe itself.

## Internals

## Provisioning and Capacity

A token bucket algorithm is used to distributes Read Capacity Units (RCUs) and Write Capacity Units (WCUs).
The bucket size 300 times the configured RCU or WCU amount, which helps dealing with burst traffic. This means that the bucket will fill up over a time of 5 minutes (300 / 60 seconds) to give you extra capacity when none is used.

## Streams

NoSQL is bad at stored procedures and answering complex computed aggregations.
A stream can be used to compute aggregations and write those back to the table as metadata.

## Example

## In closing
