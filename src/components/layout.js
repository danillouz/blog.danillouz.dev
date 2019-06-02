import React, { useState, useEffect } from 'react';
import { Link } from 'gatsby';

import { rhythm } from '../utils/typography';

import SocialLinks from './social-links';
import ThemeToggle, { getDarkModeSetting } from './theme-toggle';

function Layout({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const _isDark = getDarkModeSetting();
    if (_isDark !== isDark) {
      setIsDark(_isDark);
    }
  }, []);

  const handleToggle = () => {
    setIsDark(prevState => !prevState);
  };

  return (
    <div
      className={`layout ${isDark ? 'dark' : 'light'}`}
      style={{
        overflow: 'auto',
        padding: `${rhythm(1.5)} ${rhythm(3 / 4)}`,
        minHeight: '100vh',
        color: 'var(--fg)',
        backgroundColor: 'var(--bg)'
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
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'center',
            marginBottom: '1em'
          }}
        >
          <h3
            style={{
              fontFamily: 'monospace',
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
              console.<span className="brand">blog</span>();
            </Link>
          </h3>

          <ThemeToggle toggle={handleToggle} isDark={isDark} />
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
