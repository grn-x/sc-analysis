/**
 * Parses a README file to extract image captions
 * Format in README:
 * ### './relative/filename.png'
 * - line 1
 * - line 2
 *
 *      Example usage
 *
 * import { loadImageCaptions, createCaptionedImage } from './CaptionParser.js';
 *
 *
 * const imageCaptions = await loadImageCaptions('./README.md');
 *
 * // global availability (optional)
 * window.imageCaptions = imageCaptions;
 *
 *
 * console.log(imageCaptions.getCaption('./images/example.png'));
 *
 */

const LOGGING_ENABLED = false;


export class CaptionParser {
    constructor() {
        this.captions = new Map();
    }

    /**
     * Optional setup: provide a callback to modify image paths at runtime;
     * useful for shifted paths, where the paths referenced in the html differ from those in the readme
     * @param {function(string): string} callback receives original image path and returns modified path
     */
    setupPathCallback(callback) {
        if (typeof callback === 'function') {
            this._pathCallback = callback;
        }
    }

    /**
     * Internal helper to apply the callback if set
     * @param {string} imagePath
     * @returns {string} transformed path if callback exists, otherwise original
     */
    _transformPath(imagePath) {
        return this._pathCallback ? this._pathCallback(imagePath) : imagePath;
    }

    /**
     * Parse README content
     * @param {string} readmeContent full text content of the README
     */
    parse(readmeContent) {
        const lines = readmeContent.split('\n');
        let currentImage = null;
        let captionLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // check for image header `### './path/to/image.png'`
            const imageMatch = line.match(/^###\s+['"](.+?)['"]/);
            // match ### then whitespaces then anything between enclosing ' or "

            if (imageMatch) {
                if (currentImage && captionLines.length > 0) {
                    this.captions.set(currentImage, captionLines);
                }

                currentImage = imageMatch[1];
                captionLines = [];
            }
            // extract caption lines: `- text`
            else if (line.startsWith('-') && currentImage) {
                const captionText = line.substring(1).trim();
                if (captionText) {
                    captionLines.push(captionText);
                }
            }
            // empty line or different content ends current image block
            else if (line === '' && currentImage && captionLines.length > 0) {
                this.captions.set(currentImage, captionLines);
                currentImage = null;
                captionLines = [];
            }
        }

        if (currentImage && captionLines.length > 0) {
            this.captions.set(currentImage, captionLines);
        }

        return this;
    }

    /**
     * Get caption for an image
     * @param {string} imagePath relative path to the image (the one provided in the readme heading)
     * @returns {string[]} array of caption lines
     */
    getCaption(imagePath) {
        return this.captions.get(this._transformPath(imagePath)) || [];
    }

    /**
     * Get caption as HTML
     * @param {string} imagePath The relative path to the image (the one provided in the readme heading)
     * @param {string} fontSize Optional font size for caption lines (default: '0.4em')
     * @param {boolean} wrapURL Optional extract URL-Pattern (default: true)
     * @returns {string} HTML formatted caption
     */
     getCaptionHTML(imagePath, wrapURL = true, fontSize = '0.4em') {
        let lines = this.getCaption(imagePath);//dont transform path!!
        if (lines.length === 0) return '';

        if (wrapURL) {
            const urlRegex = /(https?:\/\/[^\s"'<>]+)/g;
            // http with optional s then : the // then list[] ^(negate) whitespace, enclosing quote, html tags (if something went wrong)
            // meaning that continue pattern for any sign thats not the ones mentioned in list, for an unlimited number of occurrences +
            // /global (allow more than one match)

            lines = lines.map(line =>
                line.replace(urlRegex, url =>
                    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
                )
            );
        }

        return lines
            .map(line =>
                fontSize
                    ? `<div style="font-size: ${fontSize};">${line}</div>`
                    : `<div>${line}</div>`
            )
            .join('');
    }

    /**
     * Check if caption data for provided imagepath was read in
     * @param {string} imagePath the relative path to the image (the one provided in the readme heading)
     * @returns {boolean}
     */
    hasCaption(imagePath) {
        return this.captions.has(this._transformPath(imagePath));
    }

    /**
     * Get all registered imagepaths as array
     * @returns {string[]} Array of image paths
     */
    getAllImages() {
        return Array.from(this.captions.keys());
    }

    /**
     * Helper function to create image element with caption
     * @param {string} src relative image source path (the one provided in the readme heading)
     *      If no caption is found, only the image is returned and a warning is logged to console.
     * @param {object} options Optional styling options
     * @returns {string} HTML string
     */
    createCaptionedImage(src, options = {}) {
        if(LOGGING_ENABLED) console.log('COptions:', options);

        // extract predefined options with defaults
        const {
            alt = '',
            w = 'auto',
            h = 'auto',
            p = '0',
            cf = '1em',
            m = '0 auto',
            mt = null,
            mb = null,
            mc = '0.5em',  // margin between image and caption
            imageClass = '',
            captionClass = 'image-caption',
            ...customOptions
        } = options;

        // custom attributes for the <div>
        const customAttributes = Object.entries(customOptions)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');

        // Build margin for container (respects mt/mb overrides)
        let containerMargin = m;
        if (mt !== null || mb !== null) {
            const marginParts = m.split(' ');
            const mTop = mt !== null ? mt : (marginParts[0] || '0');
            const mRight = marginParts[1] || marginParts[0] || 'auto';
            const mBottom = mb !== null ? mb : (marginParts[2] || marginParts[0] || '0');
            const mLeft = marginParts[3] || marginParts[1] || marginParts[0] || 'auto';
            containerMargin = `${mTop} ${mRight} ${mBottom} ${mLeft}`;
        }

        // Image has no margins - all spacing controlled by container
        //const imgStyle = `max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto;`;
        //const imgStyle = `width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto;`;
        const imgStyle = `width: ${w}; height: ${h}; object-fit: contain; display: block; margin: 0 auto;`;


        // Caption styling with margin-top for spacing from image
        const captionStyle = `font-size: ${cf}; margin-top: ${mc};`;

        if(!this.hasCaption(src)) {
            if(LOGGING_ENABLED) console.warn(`No caption found for image: ${src}`);
            return `<div style="max-width: ${w}; max-height: ${h}; margin: ${containerMargin}; padding: ${p};"><img src="${src}" alt="${alt}" class="${imageClass}" style="${imgStyle}"></div>`;
        }

        const caption = this.getCaptionHTML(src, true);

        return `
    <div class="captioned-image" style="max-width: ${w}; max-height: ${h}; margin: ${containerMargin}; padding: ${p};" ${customAttributes}>
        <img src="${src}" alt="${alt}" class="${imageClass}" style="${imgStyle}">
        <div class="${captionClass}" style="${captionStyle}">${caption}</div>
    </div>
`;
    }


    /*createCaptionedImage(src, options = {}) {
        if(LOGGING_ENABLED)console.log('COptions:', options);

        // extract predefined options with defaults
        const {
            alt = '',
            //maxWidth = '800px',
            w = '100%',
            h = 'auto',
            p = '0',
            cf = '1em',
            m= '0 auto',
            mt = '0',
            mb = '0',
            imageClass = '',
            captionClass = 'image-caption',
            ...customOptions// capture additional custom options!
        } = options;

        // custom attributes for the <div>
        const customAttributes = Object.entries(customOptions)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');

        const imgStyle = `max-width: ${w}; max-height: ${h}; width: auto; height: auto; object-fit: contain; display: block; margin: ${m}; margin-top: ${mt}; margin-bottom: ${mb};`;
        // "max-width: ${maxWidth}; width: 100%; height: auto; display: block;"         //  padding: ${p}
        const captionStyle = `font-size: ${cf};`;

        if(!this.hasCaption(src)) {
            if(LOGGING_ENABLED)console.warn(`No caption found for image: ${src}`);
            return `<img src="${src}" alt="${alt}" class="${imageClass}" style="${imgStyle} padding: ${p};">`;
        }

        const caption = this.getCaptionHTML(src);

        return_dpr `
        <div class="captioned-image" style="max-width: ${w}; max-height: ${h};  margin: 0 auto;" ${customAttributes}> 
            <img src="${src}" alt="${alt}" class="${imageClass}" style="${imgStyle}"">
            ${caption ? `<div class="${captionClass}">${caption}</div>` : ''}
        </div>
    `;//max-width: ${maxWidth};

        return `
    <div class="captioned-image" style="max-width: ${w}; max-height: ${h}; margin: 0 auto; padding: ${p};" ${customAttributes}>
        <img src="${src}" alt="${alt}" class="${imageClass}" style="${imgStyle}">
        <div class="${captionClass}" style="${captionStyle}">${caption}</div>
    </div>
`; //without padding applied to caption
    }*/
}

// ----- static exported functions -----

/**
 * Load and parse README file
 * @param {string} readmePath path to README file, read in and passed to {@link CaptionParser.parse}
 * @returns {Promise<CaptionParser>}
 */
export async function loadImageCaptions(readmePath = './README.md') {
    try {
        const response = await fetch(readmePath);
        const content = await response.text();
        const parser = new CaptionParser();
        parser.parse(content);
        if(LOGGING_ENABLED)console.log(`Loaded ${parser.getAllImages().length} image captions from ${readmePath}`);
        return parser;
    } catch (error) {
        if(LOGGING_ENABLED)console.error('Failed to load image captions:', error);
        return new CaptionParser(); // return empty parser :(
    }
}


/**
 * Helper function to create image element with caption
 * calls {@link CaptionParser.createCaptionedImage} under the hood
 * @param {string} src relative image source path (the one provided in the readme heading)
 * @param {CaptionParser} parser parser instance
 * @param {object} options Optional styling options
 * @returns {string} HTML string
 */
export function createCaptionedImage(src, parser, options = {}) {
    return parser.createCaptionedImage(src, options);
}
