import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

const getPrefersDark = () => {
  if (!window.matchMedia) {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

export const getDarkModeSetting = () => {
  const hasStored = localStorage.hasOwnProperty('dark');
  if (hasStored) {
    const storedSetting = JSON.parse(localStorage.getItem('dark'));
    return storedSetting;
  }

  const preferredSetting = getPrefersDark();
  return preferredSetting;
};

function ThemeToggle({ toggle, isDark }) {
  console.log('isDark: ', isDark);
  useEffect(() => {
    localStorage.setItem('dark', isDark);
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
