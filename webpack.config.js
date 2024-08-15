const path = require('path');

module.exports = {
  entry: './ReactEmbodiedAgent.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'react-embodied-agent.js',
    library: 'ReactEmbodiedAgent',
    libraryTarget: 'umd',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
    ],
  },
};