import '../node_modules/mathlive/mathlive.min.mjs';

const mathliveStylesheetUrl = new URL(
  '../node_modules/mathlive/mathlive-static.css',
  import.meta.url
).href;

class FunctionNodeUI extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: "open" });

		this.shadowRoot.innerHTML = `
			<style>
				math-field {
					min-width: 100px;
					border-radius: 4px;
				}
			</style>
			<div class="wrapper">
				<math-field class="func" readonly></math-field>
			</div>
		`;

		this.funcField = this.shadowRoot.querySelector('math-field');
		this.funcField.value = 'f(\\placeholder[var]{x}) = \\placeholder[expr]{}';
		MathfieldElement.soundsDirectory = null;

		this._ensurePlaceholderStyles = this._ensurePlaceholderStyles.bind(this);

		customElements.whenDefined('math-field').then(() => {
			this._ensurePlaceholderStyles();
			this.funcField.addEventListener('focusin', this._ensurePlaceholderStyles);
		});

		this.outputs = [];
	}

	connectedCallback() {
		this.funcField.addEventListener('mount', () => {
			this._removeToggleButtons();
		});
		requestAnimationFrame(() => this._removeToggleButtons());

		this.funcField.addEventListener("input", (ev) => {
			this.varValue = this.funcField.getPromptValue('var');
			this.exprValue = this.funcField.getPromptValue('expr');
			this.outputs[0].changed(`f(${this.varValue}) = ${this.exprValue}`)
		});
		this.addEventListener("pointerdown", e => e.stopImmediatePropagation());
		this.addEventListener("pointerup", e => e.stopImmediatePropagation());
		this.addEventListener("click", e => e.stopPropagation());
	}

	focus() {
		this.funcField.focus();
		this.funcField.selection = this.funcField.getPromptRange("expr");
	}

	disconnectedCallback() {
		this.funcField?.removeEventListener('focusin', this._ensurePlaceholderStyles);
	}

	_ensurePlaceholderStyles() {
		const field = this.funcField;
		if (!field) return;
		const root = field.shadowRoot;
		if (!root) {
			requestAnimationFrame(() => this._ensurePlaceholderStyles());
			return;
		}
		if (root.querySelector('style[data-placeholder-theme]')) return;

		const style = document.createElement('style');
		style.dataset.placeholderTheme = 'true';
		style.textContent = `
			.ML__placeholder,
			.ML__prompt {
				padding-bottom: 5px;
				border-radius: 0px;
				background: transparent;
				color: #ff0000ff;
			}
		`;
		root.append(style);
	}

	_removeToggleButtons() {
		const root = this.funcField.shadowRoot || this.funcField;
		const vk = root.querySelector('.ML__virtual-keyboard-toggle');
		if (vk) vk.remove();
		const mt = root.querySelector('.ML__menu-toggle');
		if (mt) mt.remove();
	}
}

customElements.define("function-node", FunctionNodeUI);
