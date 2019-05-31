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
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 400,
            color: 'var(--color-blue)',
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
        </h2>
      </header>

      <main>{children}</main>

      <footer
        style={{
          textAlign: 'center',
          color: 'var(--color-grey)',
          fontSize: '0.8em'
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
            style={{ color: 'var(--color-grey)' }}
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
