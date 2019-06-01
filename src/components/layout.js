import React from 'react';
import { Link } from 'gatsby';

import { rhythm } from '../utils/typography';

import SocialLinks from './social-links';

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
        <h2
          style={{
            fontFamily: 'monospace',
            fontWeight: 500,
            color: 'var(--color-black)',
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
            console.<span style={{ color: 'var(--color-blue)' }}>blog</span>();
          </Link>
        </h2>
      </header>

      <main>{children}</main>

      <footer
        style={{
          textAlign: 'center',
          fontFamily: 'sans-serif',
          fontWeight: 300,
          fontSize: '0.9em'
        }}
      >
        <p
          style={{
            marginBottom: '0.5em'
          }}
        >
          &copy; {new Date().getFullYear()} Daniël Illouz
        </p>

        <p
          style={{
            marginBottom: '0.5em'
          }}
        >
          <SocialLinks />
        </p>

        <p
          style={{
            marginBottom: '0.5em'
          }}
        >
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
