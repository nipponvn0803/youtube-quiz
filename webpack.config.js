const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",
  entry: {
    background: "./src/background.ts",
    aiClient: "./src/aiClient.ts",
    options: "./src/options.ts",
    youtubeQuizContent: "./src/youtubeQuizContent.ts",
    youtubeInterceptor: "./src/youtubeInterceptor.ts",
  },
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  module: {
    rules: [{ test: /\.ts$/, use: "ts-loader" }],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "options.html", to: "." },
        { from: "icons", to: "icons" },
      ],
    }),
  ],
};
