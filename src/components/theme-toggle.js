import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

const _getPrefersDark = _window => {
  if (!_window.matchMedia) {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export function getDarkModeSetting() {
  // Gatsby throws on(prod) builds when we assume access to "window"
  // because it builds in a non browser env. Use "global" instead.
  // Only "safe" way is usage in "hooks" or "componentDidMount"; see "useEffect"
  // below.
  let _window = global;

  if (!_window.localStorage) {
    return false;
  }

  const hasStored = _window.localStorage.hasOwnProperty('dark');
  if (hasStored) {
    const storedSetting = JSON.parse(_window.localStorage.getItem('dark'));
    return storedSetting;
  }

  const preferredSetting = _getPrefersDark(_window);
  return preferredSetting;
}

function ThemeToggle({ toggle, isDark }) {
  useEffect(() => {
    window.localStorage.setItem('dark', isDark);
  }, [isDark]);

  return (
    <div className="theme-toggle">
      <button className="switch" onClick={toggle}>
        {isDark ? 'Light Mode' : 'Dark Mode'}
      </button>
    </div>
  );
}

ThemeToggle.propTypes = {
  toggle: PropTypes.func.isRequired,
  isDark: PropTypes.bool.isRequired
};

export default ThemeToggle;
