export default class SearchPaths extends FormApplication {
    constructor() {
        super({}, {});
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "scene-background-browser-search-paths",
            classes: ["sheet"],
            template: "modules/scene-background-browser/templates/searchPaths.html",
            resizable: true,
            minimizable: false,
            title: "",
            width: 500
        });
    }

    async getData(options) {
        const data = super.getData(options);
        data.paths = game.settings.get("scene-background-browser", "searchPaths").flat().join('\n');
        return data;
    }

    /**
     * @param {JQuery} html
     */
    activateListeners(html) {
        super.activateListeners(html);
        html.find("button#cancelButton").on("click", () => {
            this.close();
        });
    }

    /**
     * @param {Event} event
     * @param {Object} formData
     */
    async _updateObject(event, formData) {
        game.settings.set("scene-background-browser", "searchPaths", Array.from(new Set(formData.SearchPaths.split("\n"))));
    }
}
