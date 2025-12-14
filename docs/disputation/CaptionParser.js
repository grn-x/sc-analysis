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
        return this.captions.get(imagePath) || [];
    }

    /**
     * Get caption as HTML
     * @param {string} imagePath The relative path to the image (the one provided in the readme heading)
     * @returns {string} HTML formatted caption
     */
    getCaptionHTML(imagePath) {
        const lines = this.getCaption(imagePath);
        if (lines.length === 0) return '';

        return lines.map(line => `<div>${line}</div>`).join('');
    }

    /**
     * Check if caption data for provided imagepath was read in
     * @param {string} imagePath the relative path to the image (the one provided in the readme heading)
     * @returns {boolean}
     */
    hasCaption(imagePath) {
        return this.captions.has(imagePath);
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
     * @param {object} options Optional styling options
     * @returns {string} HTML string
     */
    createCaptionedImage(src, options = {}) {
        if(LOGGING_ENABLED)console.log('COptions:', options);

        // extract predefined options with defaults
        const {
            alt = '',
            maxWidth = '800px',
            imageClass = '',
            captionClass = 'image-caption',
            ...customOptions // capture additional custom options!
        } = options;

        // custom attributes for the <div>
        const customAttributes = Object.entries(customOptions)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ');

        const caption = this.getCaptionHTML(src);

        return `
        <div class="captioned-image" style="max-width: ${maxWidth}; margin: 0 auto;" ${customAttributes}>
            <img src="${src}" alt="${alt}" class="${imageClass}" style="width: 100%; height: auto; display: block;">
            ${caption ? `<div class="${captionClass}">${caption}</div>` : ''}
        </div>
    `;
    }

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
