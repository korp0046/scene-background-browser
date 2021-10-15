import SearchPaths from "./applications/searchPaths.js";
import ArtSelect from "./applications/artSelect.js";
import FilterSettings from "./applications/searchFilters.js";
import { getFileName, getFileNameWithExt, simplifyTokenName, simplifyPath, parseSearchPaths, parseKeywords, isImage, isVideo } from "./scripts/utils.js"

// Default path where the script will look for background art
const DEFAULT_TOKEN_PATHS = ["modules/caeora-maps-tokens-assets/assets/maps/"];

// Controls whether found art should be filtered by 5e monster srd
let filterMSRD = true;

// Controls whether a keyword search is to be performed in addition to full-name search
let keywordSearch = false;
let excludedKeywords = [];

// Disables storing of background paths in a cache
let disableCaching = false;

// A cached map of all the found tokens
let cachedBackgrounds  = new Set();

// Tokens found with caching disabled
let foundBackgrounds = new Set();

// Tracks if module has been initialized
let initialized = false;

// Keyboard key controlling the pop-up when dragging in a background from the Actor Directory
let actorDirKey = "";

let debug = false;

let runSearchOnPath = false;

async function registerWorldSettings() {

    game.settings.register("scene-background-browser", "debug", {
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        onChange: val => debug = val
    });

    game.settings.registerMenu("scene-background-browser", "searchPaths", {
        name: game.i18n.localize("scene-background-browser.searchPathsTitle"),
        hint: game.i18n.localize("scene-background-browser.SearchPathsHint"),
        icon: "fas fa-exchange-alt",
        type: SearchPaths,
        restricted: true,
    });

    game.settings.register("scene-background-browser", "searchPaths", {
        scope: "world",
        config: false,
        type: Array,
        default: DEFAULT_TOKEN_PATHS,
        onChange: async function (_) {
            if (game.user.can("SETTINGS_MODIFY"))
                await game.settings.set("scene-background-browser", "forgevttPaths", []);
            await parseSearchPaths(debug);
            if (!disableCaching) cacheBackgrounds ()
        }
    });

    game.settings.register("scene-background-browser", "disableCaching", {
        name: game.i18n.localize("scene-background-browser.DisableCachingName"),
        hint: game.i18n.localize("scene-background-browser.DisableCachingHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: disable => { disableCaching = disable; cacheBackgrounds (); }
    });

    game.settings.register("scene-background-browser", "disableAutomaticPopup", {
        name: game.i18n.localize("scene-background-browser.DisableAutomaticPopupName"),
        hint: game.i18n.localize("scene-background-browser.DisableAutomaticPopupHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
    });

    game.settings.register("scene-background-browser", "filterMSRD", {
        name: game.i18n.localize("scene-background-browser.FilterMSRDName"),
        hint: game.i18n.localize("scene-background-browser.FilterMSRDHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: filter => { filterMSRD = filter; cacheBackgrounds (); }
    });

    game.settings.register("scene-background-browser", "keywordSearch", {
        name: game.i18n.localize("scene-background-browser.KeywordSearchName"),
        hint: game.i18n.localize("scene-background-browser.KeywordSearchHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: kSearch => keywordSearch = kSearch
    });

    game.settings.register("scene-background-browser", "excludedKeywords", {
        name: game.i18n.localize("scene-background-browser.ExcludedKeywordsName"),
        hint: game.i18n.localize("scene-background-browser.ExcludedKeywordsHint"),
        scope: "world",
        config: true,
        type: String,
        default: "and,for",
        onChange: keywords => excludedKeywords = parseKeywords(keywords)
    });

    game.settings.register("scene-background-browser", "actorDirectoryKey", {
        name: game.i18n.localize("scene-background-browser.ActorDirectoryKeyName"),
        hint: game.i18n.localize("scene-background-browser.ActorDirectoryKeyHint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            "Control": "Ctrl",
            "Shift": "Shift",
            "Alt": "Alt"
        },
        default: "Control",
        onChange: key => actorDirKey = key
    });

    game.settings.register("scene-background-browser", "runSearchOnPath", {
        name: game.i18n.localize("scene-background-browser.runSearchOnPathName"),
        hint: game.i18n.localize("scene-background-browser.runSearchOnPathHint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: val => runSearchOnPath = val
    });

    // Legacy filter setting, retained in case some users have used this setting
    game.settings.register("scene-background-browser", "portraitFilter", {
        scope: "world",
        config: false,
        type: String,
        default: "",
    });

    // Legacy filter setting, retained in case some users have used this setting
    game.settings.register("scene-background-browser", "tokenFilter", {
        scope: "world",
        config: false,
        type: String,
        default: "",
    });

    game.settings.registerMenu("scene-background-browser", "searchFilterMenu", {
        name: game.i18n.localize("scene-background-browser.searchFilterMenuName"),
        hint: game.i18n.localize("scene-background-browser.searchFilterMenuHint"),
        scope: "world",
        icon: "fas fa-exchange-alt",
        type: FilterSettings,
        restricted: true,
    });

    game.settings.register('scene-background-browser', 'searchFilterSettings', {
        scope: 'world',
        config: false,
        type: Object,
        default: {
            portraitFilterInclude: game.settings.get("scene-background-browser", "portraitFilter"),
            portraitFilterExclude: "",
            portraitFilterRegex: "",
            tokenFilterInclude: game.settings.get("scene-background-browser", "tokenFilter"),
            tokenFilterExclude: "",
            tokenFilterRegex: "",
            generalFilterInclude: "",
            generalFilterExclude: "",
            generalFilterRegex: "",
        },
    });

    game.settings.register("scene-background-browser", "forgevttPaths", {
        scope: "world",
        config: false,
        type: Array,
        default: [],
    });

    filterMSRD = game.settings.get("scene-background-browser", "filterMSRD");
    disableCaching = game.settings.get("scene-background-browser", "disableCaching");
    keywordSearch = game.settings.get("scene-background-browser", "keywordSearch");
    actorDirKey = game.settings.get("scene-background-browser", "actorDirectoryKey");
    debug = game.settings.get("scene-background-browser", "debug");
    runSearchOnPath = game.settings.get("scene-background-browser", "runSearchOnPath");
}

/**
 * Initialize the background Variants module on Foundry VTT init
 */
async function initialize() {

    // Initialization should only be performed once
    if (initialized) {
        return;
    }

    await registerWorldSettings();
    if (game.user && game.user.can("FILES_BROWSE") && game.user.can("SCENE_CONFIGURE")) {
        Hooks.on("renderSceneConfig", modSceneConfig);
        await cacheBackgrounds ();
    }

    initialized = true;
}

/**
 * Adds a button to 'Scene Configuration' panel
 * ArtSelect using the scene's name.
 */
function modSceneConfig(app, html, data) {
    let fields = html[0].getElementsByClassName("form-group");
    let backgroundEl = fields[3];
    let el = document.createElement("button");
    el.className = 'file-browser';
    el.type = "button";
    el.title = game.i18n.localize("scene-background-browser.TokenConfigButtonTitle");
    el.innerHTML = '<i class="fas fa-images"/>';
    let imageinput = backgroundEl.getElementsByClassName("image");
    // When a background is selected, fill the form with that artwork path.
    el.onclick = async () => displayArtSelect(app.object.data.name, (imgSrc) => {
        imageinput.value = imgSrc;
        imageinput[0].defaultValue = imgSrc;
    });
    backgroundEl.append(el);
    return;
}

/**
 * Search for and cache all the found background art
 */
async function cacheBackgrounds () {
    if (debug) console.log("STARTING: background Caching");
    cachedBackgrounds .clear();

    if (disableCaching) {
        if (debug) console.log("ENDING: background Caching (DISABLED)");
        return;
    }

    await findTokens("", true);
    cachedBackgrounds  = foundBackgrounds;
    foundBackgrounds = new Set();
    if (debug) console.log("ENDING: background Caching");
}

function checkAgainstFilters(src, filters) {
    const text = runSearchOnPath ? decodeURIComponent(src) : getFileNameWithExt(src);

    if (filters.regex) {
        return filters.regex.test(text);
    }
    if (filters.include) {
        if (!text.includes(filters.include)) return false;
    }
    if (filters.exclude) {
        if (text.includes(filters.exclude)) return false;
    }
    return true;
}

/**
 * Search for tokens matching the supplied name
 */
async function findTokens(name, caching = false) {
    if (debug) console.log("STARTING: background Search", name, caching);

    // Select filters based on type of search
    let filters = game.settings.get("scene-background-browser", "searchFilterSettings");
    filters = {
        include: filters.generalFilterInclude,
        exclude: filters.generalFilterExclude,
        regex: filters.generalFilterRegex
    }
    if (filters.regex) filters.regex = new RegExp(filters.regex);

    foundBackgrounds = new Set();
    const simpleName = simplifyTokenName(name);

    if (cachedBackgrounds .size != 0) {
        cachedBackgrounds .forEach((tokenSrc) => {
            const simplified = runSearchOnPath ? simplifyPath(tokenSrc) : simplifyTokenName(getFileName(tokenSrc));
            if (simplified.includes(simpleName)) {
                if (!filters || checkAgainstFilters(tokenSrc, filters)) {
                    foundBackgrounds.add(tokenSrc);
                }
            }
        });
    } else if (caching || disableCaching) {
        let searchPaths = await parseSearchPaths(debug);
        for (let path of searchPaths.get("data")) {
            await walkFindTokens(path, simpleName, "", filters);
        }
        for (let [bucket, paths] of searchPaths.get("s3")) {
            for (let path of paths) {
                await walkFindTokens(path, simpleName, bucket, filters);
            }
        }
        for (let path of searchPaths.get("forge")) {
            await walkFindTokens(path, simpleName, "", filters, true);
        }
    }
    if (debug) console.log("ENDING: background Search", foundBackgrounds);
    return foundBackgrounds;
}

/**
 * Walks the directory tree and finds all the matching background art
 */
async function walkFindTokens(path, name = "", bucket = "", filters = null, forge = false) {
    if (!bucket && !path) return;

    let files = [];
    try {
        if (bucket) {
            files = await FilePicker.browse("s3", path, { bucket: bucket });
        } else if (forge) {
            files = await FilePicker.browse("", path, { wildcard: true });
        } else {
            files = await FilePicker.browse("data", path);
        }
    } catch (err) {
        console.log(`${game.i18n.localize("token-variant.PathNotFoundError")} ${path}`);
        return;
    }

    if (files.target == ".") return;

    for (let tokenSrc of files.files) {
        if (!name) {
            foundBackgrounds.add(tokenSrc);
        } else {
            const simplified = runSearchOnPath ? simplifyPath(tokenSrc) : simplifyTokenName(getFileName(tokenSrc));
            if (simplified.includes(name)) {
                if (!filters || checkAgainstFilters(tokenSrc, filters)) {
                    foundBackgrounds.add(tokenSrc);
                }
            }
        }
    }
    for (let dir of files.dirs) {
        await walkFindTokens(dir, name, bucket, filters, forge);
    }
}

/**
 * Performs searches and displays the Art Select screen with the results.
 * @param name The name to be used as the search criteria
 * @param callback function that will be called with the user selected image path as argument
 */
async function displayArtSelect(name, callback) {
    console.log("STARTING: display Art Select", name);
    // Set Art Select screen title
    let title = game.i18n.localize("scene-background-browser.SelectScreenTitle");

    let allImages = await doArtSearch(name, false);
    if (!allImages) return;

    let artFound = false;
    let allButtons = new Map();
    allImages.forEach((tokens, search) => {
        let buttons = [];
        tokens.forEach(token => {
            artFound = true;
            const vid = isVideo(token);
            const img = isImage(token);
            buttons.push({
                path: token,
                img: img,
                vid: vid,
                type: vid || img,
                label: getFileName(token),
            })
        })
        allButtons.set(search, buttons);
    });

    let searchAndDisplay = ((search) => {
        displayArtSelect(search, callback);
    });

    if (artFound) {
        let artSelect = new ArtSelect(title, name, allButtons, callback, searchAndDisplay);
        artSelect.render(true);
    } else {
        let artSelect = new ArtSelect(title, name, null, callback, searchAndDisplay);
        artSelect.render(true);
    }

}

async function doArtSearch(name, ignoreKeywords = false) {
    if (debug) console.log("STARTING: Art Search", name);

    let searches = [name];
    let allImages = new Map();
    let usedTokens = new Set();

    if (keywordSearch && !ignoreKeywords) {
        excludedKeywords = parseKeywords(game.settings.get("scene-background-browser", "excludedKeywords"));
        searches = searches.concat(name.split(/\W/).filter(word => word.length > 2 && !excludedKeywords.includes(word.toLowerCase())).reverse());
    }

    for (let search of searches) {
        if (allImages.get(search) !== undefined) continue;
        let tokens = await findTokens(search, false);
        tokens = Array.from(tokens).filter(token => !usedTokens.has(token))
        tokens.forEach(token => usedTokens.add(token));
        allImages.set(search, tokens);
    }

    if (debug) console.log("ENDING: Art Search");
    return allImages;
}

// Initialize module
Hooks.once("ready", initialize);

// Make displayArtSelect function accessible through 'game'
Hooks.on("init", function () {
    game.TokenVariants = {
        displayArtSelect: displayArtSelect,
        cacheBackgrounds : cacheBackgrounds 
    };
});
