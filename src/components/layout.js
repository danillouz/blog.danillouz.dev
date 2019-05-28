import React from 'react';
import { Link } from 'gatsby';

import { rhythm, scale } from '../utils/typography';

function Layout({ location, title, children }) {
  const rootPath = `${__PATH_PREFIX__}/`;

  let header;
  if (location.pathname === rootPath) {
    header = (
      <h1
        style={{
          ...scale(1.5),
          marginBottom: rhythm(1.5),
          marginTop: 0
        }}
      >
        <Link
          style={{
            boxShadow: 'none',
            textDecoration: 'none',
            color: 'inherit'
          }}
          to={'/'}
        >
          {title}
        </Link>
      </h1>
    );
  } else {
    header = (
      <h3
        style={{
          fontFamily: 'Montserrat, sans-serif',
          marginTop: 0
        }}
      >
        <Link
          style={{
            boxShadow: 'none',
            textDecoration: 'none',
            color: 'inherit'
          }}
          to={'/'}
        >
          {title}
        </Link>
      </h3>
    );
  }
  return (
    <div
      style={{
        marginLeft: 'auto',
        marginRight: 'auto',
        maxWidth: rhythm(24),
        padding: `${rhythm(1.5)} ${rhythm(3 / 4)}`
      }}
    >
      <header>{header}</header>

      <main>{children}</main>

      <footer>
        <p>&copy; {new Date().getFullYear()} Daniël Illouz</p>

        <p>
          <a href="/rss.xml" target="_blank" rel="noopener noreferrer">
            RSS
          </a>
        </p>

        <p>
          Built with{' '}
          <a
            href="https://www.gatsbyjs.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Gatsby
          </a>
        </p>
      </footer>
    </div>
  );
}

export default Layout;
