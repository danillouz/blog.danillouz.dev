const blogName = 'blog.danillouz.dev';

module.exports = {
  siteMetadata: {
    title: blogName,
    author: 'Daniël Illouz',
    description: 'Writing about things I learn.',
    siteUrl: 'https://blog.danillouz.dev',
    social: {
      website: 'https://www.danillouz.dev',
      github: 'https://github.com/danillouz',
      stackOverflow:
        'https://stackoverflow.com/users/4455533/danillouz?tab=profile',
      twitter: 'https://twitter.com/danillouz'
    }
  },
  plugins: [
    {
      resolve: 'gatsby-source-filesystem',
      options: {
        path: `${__dirname}/content/blog`,
        name: 'blog'
      }
    },
    {
      resolve: 'gatsby-source-filesystem',
      options: {
        path: `${__dirname}/content/assets`,
        name: 'assets'
      }
    },
    {
      resolve: 'gatsby-transformer-remark',
      options: {
        plugins: [
          {
            resolve: 'gatsby-remark-images',
            options: {
              maxWidth: 590
            }
          },
          {
            resolve: 'gatsby-remark-responsive-iframe',
            options: {
              wrapperStyle: 'margin-bottom: 1.0725rem'
            }
          },

          // Should be listed BEFORE primsjs plugin, like described here:
          // https://www.gatsbyjs.org/packages/gatsby-remark-autolink-headers/#how-to-use
          'gatsby-remark-autolink-headers',

          'gatsby-remark-prismjs',
          'gatsby-remark-copy-linked-files',
          'gatsby-remark-smartypants'
        ]
      }
    },
    'gatsby-transformer-sharp',
    'gatsby-plugin-sharp',
    {
      resolve: 'gatsby-plugin-google-analytics',
      options: {
        //trackingId: 'ADD YOUR TRACKING ID HERE',
      }
    },
    'gatsby-plugin-feed',
    {
      resolve: 'gatsby-plugin-manifest',
      options: {
        name: blogName,
        short_name: blogName,
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#4271ae',
        display: 'minimal-ui',
        icon: 'content/assets/icon.png'
      }
    },
    'gatsby-plugin-offline',
    'gatsby-plugin-react-helmet',
    {
      resolve: 'gatsby-plugin-typography',
      options: {
        pathToConfigModule: 'src/utils/typography'
      }
    }
  ]
};
