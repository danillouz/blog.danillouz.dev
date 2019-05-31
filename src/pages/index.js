import React from 'react';
import { Link, graphql } from 'gatsby';

import { rhythm } from '../utils/typography';

import Bio from '../components/bio';
import Layout from '../components/layout';
import SEO from '../components/seo';

function BlogIndex({ data, location }) {
  const siteTitle = data.site.siteMetadata.title;
  const posts = data.allMarkdownRemark.edges;

  return (
    <Layout location={location} title={siteTitle}>
      <SEO title="" />

      <Bio />

      {posts.map(({ node }) => {
        const title = node.frontmatter.title || node.fields.slug;
        return (
          <div key={node.fields.slug}>
            <h3
              style={{
                marginBottom: rhythm(1 / 4)
              }}
            >
              <Link
                style={{
                  color: 'var(--color-black)',
                  boxShadow: 'none'
                }}
                to={node.fields.slug}
              >
                {title}
              </Link>
            </h3>

            <small>{node.frontmatter.date}</small>

            <p
              dangerouslySetInnerHTML={{
                __html: node.frontmatter.description || node.excerpt
              }}
            />
          </div>
        );
      })}
    </Layout>
  );
}

export default BlogIndex;

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { fields: [frontmatter___date], order: DESC }) {
      edges {
        node {
          excerpt
          fields {
            slug
          }
          frontmatter {
            date(formatString: "MMMM DD, YYYY")
            title
            description
          }
        }
      }
    }
  }
`;
