import React from 'react';
import { Link } from 'gatsby';

import { rhythm } from '../utils/typography';

import SocialLinks from './social-links';

function Layout({ children }) {
  return (
    <div
      style={{
        overflow: 'auto',
        padding: `${rhythm(1.5)} ${rhythm(3 / 4)}`,
        minHeight: '100vh',
        color: 'var(--color-black)',
        backgroundColor: 'var(--color-white)'
      }}
    >
      <main
        style={{
          margin: 'auto',
          maxWidth: rhythm(24)
        }}
      >
        <header
          style={{
            marginBottom: '1em'
          }}
        >
          <h1
            style={{
              fontFamily: 'monospace',
              fontSize: '2.6em',
              fontWeight: 500,
              margin: 0
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
              console.
              <span
                style={{
                  color: 'var(--color-orange)'
                }}
              >
                blog
              </span>
              ();
            </Link>
          </h1>
        </header>
        {children}
      </main>

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
