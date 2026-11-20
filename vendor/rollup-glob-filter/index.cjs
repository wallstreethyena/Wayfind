const { Minimatch } = require('minimatch');

// Rollup's createFilter and fdir use the matcher factory for build-time paths.
// Reject repeated extglobs before compiling any pattern.
module.exports = function makePathFilter(patterns, options = {}) {
  const matchers = [].concat(patterns).map(pattern => {
    if (typeof pattern !== 'string') throw new TypeError('Expected a path pattern');
    if (/[+*]\(/.test(pattern)) throw new Error('Repeated extglobs are unsupported in build filters');
    return new Minimatch(pattern, {
      dot: options.dot,
      nocase: options.nocase,
      matchBase: options.basename || options.matchBase,
      nocomment: true,
      platform: 'linux'
    });
  });
  return path => matchers.some(matcher => matcher.match(path));
};
