import moment from "moment";

class Menu {
	addItem() { return this; }
	showAtMouseEvent() {}
}
class TFile {}
class TFolder {}
function normalizePath(path) { return path.replace(/\\/g, "/").replace(/\/+/, "/"); }

export { moment, Menu, TFile, TFolder, normalizePath };
