import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import alias from '@rollup/plugin-alias';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

export default {
    input: 'src/index.js',
    output: {
        file: 'bundle.js',
        format: 'iife',
        sourcemap: true,
    },
    plugins: [
        /**
         * Recommended (but not required):
         *
         * alias allow us to use release builds in production
         * minified builds in PixiJS exclude verbose logs
         * and other non-critical debugging information.
         */
        ...process.env.BUILD === 'production' ? [alias({
            entries: [{
                find: /^(@pixi\/([^\/]+))$/,
                replacement: 'node_modules/$1/dist/esm/$2.min.mjs',
            }, {
                find: 'pixi.js',
                replacement: 'node_modules/pixi.js/dist/esm/pixi.min.mjs',
            }]
        })] : [],
        /**
         * Required!
         *
         * `preferBuiltins` is required to not confuse Rollup with
         * the 'url' dependence that is used by PixiJS utils
         */
        resolve({
            preferBuiltins: false,
        }),
        /**
         * Required!
         *
         * PixiJS third-party dependencies use CommonJS exports
         * and do not have modules bundles available
         */
        commonjs(),
        process.env.BUILD !== 'production' ? serve({}) : '',
        process.env.BUILD !== 'production' ? livereload() : '',
    ]
};
