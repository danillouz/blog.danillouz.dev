import React from 'react';
import { graphql } from 'gatsby';

import Layout from '../components/layout';
import SEO from '../components/seo';

function NotFoundPage({ data }) {
  const siteTitle = data.site.siteMetadata.title;

  return (
    <Layout location={this.props.location} title={siteTitle}>
      <SEO title="404: Not Found" />

      <h1>Not Found</h1>

      <p>Sorry, this page doesn&apos;t exist.</p>
    </Layout>
  );
}

export default NotFoundPage;

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
  }
`;
