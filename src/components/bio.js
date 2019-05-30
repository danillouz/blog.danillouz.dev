import React from 'react';
import { StaticQuery, graphql } from 'gatsby';
import Image from 'gatsby-image';

import { rhythm } from '../utils/typography';

// See: https://www.gatsbyjs.org/docs/static-query/
const bioQuery = graphql`
  query BioQuery {
    avatar: file(absolutePath: { regex: "/profile-pic.jpg/" }) {
      childImageSharp {
        fixed(width: 50, height: 50) {
          ...GatsbyImageSharpFixed
        }
      }
    }
    site {
      siteMetadata {
        author
        description
      }
    }
  }
`;

function Bio() {
  return (
    <StaticQuery
      query={bioQuery}
      render={data => {
        const { author, description } = data.site.siteMetadata;

        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gridGap: rhythm(1 / 2),
              alignItems: 'center',
              marginBottom: rhythm(2.5),
              fontWeight: 300
            }}
          >
            <Image
              fixed={data.avatar.childImageSharp.fixed}
              alt={author}
              style={{
                margin: 0,
                minWidth: 50,
                borderRadius: '100%'
              }}
              imgStyle={{
                borderRadius: '50%'
              }}
            />

            <div>
              <p
                style={{
                  margin: 0
                }}
              >
                by <b>{author}</b>
              </p>

              <p
                style={{
                  margin: 0
                }}
              >
                <i>{description}</i>
              </p>
            </div>
          </div>
        );
      }}
    />
  );
}

export default Bio;
