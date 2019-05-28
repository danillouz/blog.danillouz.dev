import React from 'react';
import { Link } from 'gatsby';

import { rhythm } from '../utils/typography';

function Layout({ title, children }) {
  return (
    <div
      style={{
        marginLeft: 'auto',
        marginRight: 'auto',
        maxWidth: rhythm(24),
        padding: `${rhythm(1.5)} ${rhythm(3 / 4)}`
      }}
    >
      <header>
        <h3
          style={{
            fontFamily: 'Montserrat, sans-serif',
            color: 'var(--color-cyan)',
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
      </header>

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
