import { LocalEnv } from './LocEnvEval.js';
import { loadImageCaptions, createCaptionedImage } from './CaptionParser.js';


//==============================================================================
// Initialize LocalEnv to determine loading strategy & setup dependencies
//==============================================================================

//LocalEnv.debugOverwriteLocal(false); //confirm non local loading
LocalEnv.init({ showBanner: true, bannerMessage: 'Local Host Detected', showBannerExt: true, bannerMessageExt: 'External Host Detected' });

let Reveal, Markdown, RevealMath, Notes, Highlight, Search, Zoom;

// load modules; if LocalEnv.isLocal is true, load from local paths; else try CDN first, then fallback to local paths

async function loadModule(cdnPath, localPath, moduleName) {
    if (LocalEnv.isLocal) {
        try {
            console.log(`Loading ${moduleName} locally from ${localPath}`);
            const module = await import(localPath);
            return module.default;
        } catch (error) {
            console.warn(`Failed to load ${moduleName} locally, this shouldn't happen in local mode:`, error);
            throw error;
        }
    } else {
        try {
            console.log(`Loading ${moduleName} from CDN: ${cdnPath}`);
            const module = await import(cdnPath);
            return module.default;
        } catch (error) {
            console.warn(`Failed to load ${moduleName} from CDN, falling back to local:`, error);
            try {
                const module = await import(localPath);
                return module.default;
            } catch (fallbackError) {
                console.error(`Failed to load ${moduleName} from both CDN and local sources:`, fallbackError);
                throw fallbackError;
            }
        }
    }
}


try {
    Reveal = await loadModule(
        'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/reveal.esm.js',
        './imports/reveal.esm.js',
        'Reveal'
    );

    Markdown = await loadModule(
        'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/plugin/markdown/markdown.esm.js',
        './imports/plugin/markdown/markdown.esm.js',
        'Markdown'
    );

    RevealMath = await loadModule(
        'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/plugin/math/math.esm.js',
        './imports/plugin/math/math.esm.js',
        'RevealMath'
    );

    Notes = await loadModule(
        'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/plugin/notes/notes.esm.js',
        './imports/plugin/notes/notes.esm.js',
        'Notes'
    );

    Highlight = await loadModule(
        'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/plugin/highlight/highlight.esm.js',
        './imports/plugin/highlight/highlight.esm.js',
        'Highlight'
    );

    Search = await loadModule(
        'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/plugin/search/search.esm.js',
        './imports/plugin/search/search.esm.js',
        'Search'
    );

    Zoom = await loadModule(
        'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.2.1/plugin/zoom/zoom.esm.js',
        './imports/plugin/zoom/zoom.esm.js',
        'Zoom'
    );
} catch (error) {
    console.error('Critical error loading Reveal.js modules:', error);
    throw error;
}

// KaTeX loaded internally by RevealMath plugin; also allows local/offline loading if setup correctly
const katexConfig = {
    version: 'latest',
    delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
    ],
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
};

// Perform mentioned KaTeX offline setup
if (LocalEnv.isLocal) {
    katexConfig.local = 'imports/katex'; //TODO .js?
    console.log('Using local KaTeX from:', katexConfig.local);
} else {
    console.log('Using KaTeX from CDN (version:', katexConfig.version + ')'); // CDN by default: https://cdn.jsdelivr.net/npm/katex // from https://revealjs.com/math/#katex-configuration
}

//==============================================================================
// Load image captions from README and insert into markdown processing pipeline
//==============================================================================

const CaptionParser = await loadImageCaptions('./resources/README.md');
CaptionParser.setupPathCallback((originalPath) => {
    //return './resources/' + originalPath;
    if(originalPath.startsWith('resources')) {
        return originalPath.replace('resources', '');
    }
});

console.log('Image captions loaded. Available images:', CaptionParser.getAllImages());



// "clone" Marked instance used by revealMarkdownPlugin
const revealMarkdownPlugin = Markdown();

// define Marked extension for replacing dummy tags with actual images and their captions
const captionExt = {
    name: 'captionedImage',
    level: 'block',
    start(src) {
        // where to start matching
        return src.indexOf('<div caption-replace-tag-img=');
    },
    tokenizer(src, tokens) {
        const rule = /^<div\s+caption-replace-tag-img="([^"]+)"\s*><\/div>/;
        const match = rule.exec(src);
        if (match) {
            console.log('CaptionedImage tokenizer processing src:', src);

            const token = {
                type: 'captionedImage',
                raw: match[0],
                src: match[1],
                tokens: []
            };
            return token;
        }
    },
    renderer(token) {
        // return valid HTML string for Revealjs
        const result = CaptionParser.createCaptionedImage(token.src);
        console.warn('Rendering captioned image for src:', token.src, 'Result:', result);
        return result;
        //return `<figure><img src="${token.src}"><figcaption>Caption for ${token.src}</figcaption></figure>`;
    }
};

function walkTokens(token) {
    // only process HTML blocks
    if (token.type === 'html') {
        // Replace every <div caption-replace-tag-img="..."></div> inside this block
        token.text = token.text.replace(
            /<div\s+caption-replace-tag-img="([^"]+)"\s*><\/div>/g,
            (_, src) => CaptionParser.createCaptionedImage(src)
        );
    }
}

// Add extension to our intercepted marked instance
//revealMarkdownPlugin.marked.use({ extensions: [captionExt] });
revealMarkdownPlugin.marked.use({ walkTokens: walkTokens });


//==============================================================================
// Initialize Reveal.js with desired configuration
//==============================================================================

const deck = Reveal({
    katex: katexConfig,

    plugins: [

    {
        id: 'markdown-with-extensions',
        init: (reveal) => revealMarkdownPlugin.init(reveal)
    }, // use our customized markdown plugin
        RevealMath.KaTeX, Notes, Highlight, Search, Zoom ],


    /* docs from: https://revealjs.com/config/ */

    // Display presentation control arrows
    // - true: Display controls on all screens
    // - false: Hide controls on all screens
    // - "speaker-only": Only display controls in the speaker view
    controls: "speaker-only",

    // Help the user learn the controls by providing hints, for example by
    // bouncing the down arrow when they first encounter a vertical slide
    controlsTutorial: false,

    // Determines where controls appear, "edges" or "bottom-right"
    controlsLayout: 'bottom-right',

    // Visibility rule for backwards navigation arrows; "faded", "hidden"
    // or "visible"
    controlsBackArrows: 'faded',

    // Display a presentation progress bar
    progress: true,

    // Display the page number of the current slide
    // - true:    Show slide number
    // - false:   Hide slide number
    //
    // Can optionally be set as a string that specifies the number formatting:
    // - "h.v":   Horizontal . vertical slide number (default)
    // - "h/v":   Horizontal / vertical slide number
    // - "c":   Flattened slide number
    // - "c/t":   Flattened slide number / total slides
    //
    // Alternatively, you can provide a function that returns the slide
    // number for the current slide. The function should take in a slide
    // object and return an array with one string [slideNumber] or
    // three strings [n1,delimiter,n2]. See #formatSlideNumber().
    slideNumber: false,

    // Can be used to limit the contexts in which the slide number appears
    // - "all":      Always show the slide number
    // - "print":    Only when printing to PDF
    // - "speaker":  Only in the speaker view
    showSlideNumber: 'speaker',

    // Use 1 based indexing for # links to match slide number (default is zero
    // based)
    hashOneBasedIndex: false,

    // Add the current slide number to the URL hash so that reloading the
    // page/copying the URL will return you to the same slide
    hash: true,

    // Flags if we should monitor the hash and change slides accordingly
    respondToHashChanges: true,

    // Enable support for jump-to-slide navigation shortcuts
    jumpToSlide: true,

    // Push each slide change to the browser history.  Implies `hash: true`
    history: false,

    // Enable keyboard shortcuts for navigation
    keyboard: true,

    // Optional function that blocks keyboard events when retuning false
    //
    // If you set this to 'focused', we will only capture keyboard events
    // for embedded decks when they are in focus
    keyboardCondition: null, //TODO test

    // Disables the default reveal.js slide layout (scaling and centering)
    // so that you can use custom CSS layout
    disableLayout: false,

    // Enable the slide overview mode
    overview: true,

    // Vertical centering of slides
    center: true,

    // Enables touch navigation on devices with touch input
    touch: true,

    // Loop the presentation
    loop: false,

    // Change the presentation direction to be RTL
    rtl: false,

    // Changes the behavior of our navigation directions.
    //
    // "default"
    // Left/right arrow keys step between horizontal slides, up/down
    // arrow keys step between vertical slides. Space key steps through
    // all slides (both horizontal and vertical).
    //
    // "linear"
    // Removes the up/down arrows. Left/right arrows step through all
    // slides (both horizontal and vertical).
    //
    // "grid"
    // When this is enabled, stepping left/right from a vertical stack
    // to an adjacent vertical stack will land you at the same vertical
    // index.
    //
    // Consider a deck with six slides ordered in two vertical stacks:
    // 1.1    2.1
    // 1.2    2.2
    // 1.3    2.3
    //
    // If you're on slide 1.3 and navigate right, you will normally move
    // from 1.3 -> 2.1. If "grid" is used, the same navigation takes you
    // from 1.3 -> 2.3.
    navigationMode: 'default',

    // Randomizes the order of slides each time the presentation loads
    shuffle: false,

    // Turns fragments on and off globally
    fragments: true,

    // Flags whether to include the current fragment in the URL,
    // so that reloading brings you to the same fragment position
    fragmentInURL: true,

    // Flags if the presentation is running in an embedded mode,
    // i.e. contained within a limited portion of the screen
    embedded: false,

    // Flags if we should show a help overlay when the question-mark
    // key is pressed
    help: true,

    // Flags if it should be possible to pause the presentation (blackout)
    pause: false, //TODO

    // Flags if speaker notes should be visible to all viewers
    showNotes: false,

    // Global override for autolaying embedded media (video/audio/iframe)
    // - null:   Media will only autoplay if data-autoplay is present
    // - true:   All media will autoplay, regardless of individual setting
    // - false:  No media will autoplay, regardless of individual setting
    autoPlayMedia: null, //TODO test true

    // Global override for preloading lazy-loaded iframes
    // - null:   Iframes with data-src AND data-preload will be loaded when within
    //           the viewDistance, iframes with only data-src will be loaded when visible
    // - true:   All iframes with data-src will be loaded when within the viewDistance
    // - false:  All iframes with data-src will be loaded only when visible
    preloadIframes: true, //TODO test performance

    // Can be used to globally disable auto-animation
    autoAnimate: true,

    // Optionally provide a custom element matcher that will be
    // used to dictate which elements we can animate between.
    autoAnimateMatcher: null,

    // Default settings for our auto-animate transitions, can be
    // overridden per-slide or per-element via data arguments
    autoAnimateEasing: 'ease',
    autoAnimateDuration: 1.0,
    autoAnimateUnmatched: true,

    // CSS properties that can be auto-animated. Position & scale
    // is matched separately so there's no need to include styles
    // like top/right/bottom/left, width/height or margin.
    autoAnimateStyles: [
        'opacity',
        'color',
        'background-color',
        'padding',
        'font-size',
        'line-height',
        'letter-spacing',
        'border-width',
        'border-color',
        'border-radius',
        'outline',
        'outline-offset',
    ],

    // Controls automatic progression to the next slide
    // - 0:      Auto-sliding only happens if the data-autoslide HTML attribute
    //           is present on the current slide or fragment
    // - 1+:     All slides will progress automatically at the given interval
    // - false:  No auto-sliding, even if data-autoslide is present
    autoSlide: 0,

    // Stop auto-sliding after user input
    autoSlideStoppable: true,

    // Use this method for navigation when auto-sliding (defaults to navigateNext)
    autoSlideMethod: null,

    // Specify the average time in seconds that you think you will spend
    // presenting each slide. This is used to show a pacing timer in the
    // speaker view
    defaultTiming: null, //TODO test

    // Enable slide navigation via mouse wheel
    mouseWheel: false,

    // Opens links in an iframe preview overlay
    // Add `data-preview-link` and `data-preview-link="false"` to customise each link
    // individually
    previewLinks: false, //TODO test

    // Exposes the reveal.js API through window.postMessage
    postMessage: true,

    // Dispatches all reveal.js events to the parent window through postMessage
    postMessageEvents: false,

    // Focuses body when page changes visibility to ensure keyboard shortcuts work
    focusBodyOnPageVisibilityChange: true,

    // Transition style
    transition: 'slide', // none/fade/slide/convex/concave/zoom

    // Transition speed
    transitionSpeed: 'default', // default/fast/slow

    // Transition style for full page slide backgrounds
    backgroundTransition: 'fade', // none/fade/slide/convex/concave/zoom

    // The maximum number of pages a single slide can expand onto when printing
    // to PDF, unlimited by default
    pdfMaxPagesPerSlide: Number.POSITIVE_INFINITY,

    // Prints each fragment on a separate slide
    pdfSeparateFragments: true,

    // Offset used to reduce the height of content within exported PDF pages.
    // This exists to account for environment differences based on how you
    // print to PDF. CLI printing options, like phantomjs and wkpdf, can end
    // on precisely the total height of the document whereas in-browser
    // printing has to end one pixel before.
    pdfPageHeightOffset: -1,

    // Number of slides away from the current that are visible
    viewDistance: 3,

    // Number of slides away from the current that are visible on mobile
    // devices. It is advisable to set this to a lower number than
    // viewDistance in order to save resources.
    mobileViewDistance: 2,

    // The display mode that will be used to show slides
    display: 'block',

    // Hide cursor if inactive
    hideInactiveCursor: true,

    // Time before the cursor is hidden (in ms)
    hideCursorTime: 3000,
});
await deck.initialize();





