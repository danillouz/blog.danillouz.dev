import React, { Fragment } from 'react';
import { StaticQuery, graphql } from 'gatsby';

// See: https://www.gatsbyjs.org/docs/static-query/
const socialLinksQuery = graphql`
  query socialLinksQuery {
    site {
      siteMetadata {
        social {
          website
          github
          stackOverflow
          twitter
        }
      }
    }
  }
`;

function SocialLinks() {
  return (
    <StaticQuery
      query={socialLinksQuery}
      render={data => {
        const { social } = data.site.siteMetadata;

        return (
          <Fragment>
            <a href={social.website} target="_blank" rel="noopener noreferrer">
              Website
            </a>{' '}
            &emsp;{' '}
            <a href={social.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>{' '}
            &emsp;{' '}
            <a
              href={social.stackOverflow}
              target="_blank"
              rel="noopener noreferrer"
            >
              Stack Overflow
            </a>{' '}
            &emsp;{' '}
            <a href={social.twitter} target="_blank" rel="noopener noreferrer">
              Twitter
            </a>{' '}
            &emsp;{' '}
            <a href="/rss.xml" target="_blank" rel="noopener noreferrer">
              RSS
            </a>
          </Fragment>
        );
      }}
    />
  );
}

export default SocialLinks;
