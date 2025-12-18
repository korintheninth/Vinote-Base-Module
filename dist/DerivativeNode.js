import '../node_modules/mathlive/mathlive.min.mjs';

const mathliveStylesheetUrl = new URL(
  '../node_modules/mathlive/mathlive-static.css',
  import.meta.url
).href;

class DerivativeNodeUI extends HTMLElement {
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
			<math-field class="derivative"></math-field>
		`;

		this.derivativeField = this.shadowRoot.querySelector('math-field');
		this.derivativeField.value = '\\frac{d}{d\\placeholder[var]{x}}\\placeholder[expr]{} = \\placeholder[result]{}';
		MathfieldElement.soundsDirectory = null;

		this._ensurePlaceholderStyles = this._ensurePlaceholderStyles.bind(this);

		customElements.whenDefined('math-field').then(() => {
			this._ensurePlaceholderStyles();
			this.derivativeField.addEventListener('focusin', this._ensurePlaceholderStyles);
		});

		this.inputs = [];
		this.outputs = [];
		
		this._inputExpr = '';
		this._inputVar = 'x';
	}

	connectedCallback() {
		this.derivativeField.addEventListener('mount', () => {
			this._removeToggleButtons();
		});
		requestAnimationFrame(() => this._removeToggleButtons());

		this.derivativeField.addEventListener("input", () => {
			this._inputVar = this.derivativeField.getPromptValue('var') || 'x';
			this._inputExpr = this.derivativeField.getPromptValue('expr');
			this._computeDerivative();
		});
	}

	disconnectedCallback() {
		this.derivativeField?.removeEventListener('focusin', this._ensurePlaceholderStyles);
	}

	inputChange(index, value) {
		if (index === 0 && typeof value === 'string') {
			const match = value.match(/^f\((\w+)\)\s*=\s*(.+)$/);
			if (match) {
				this._inputVar = match[1];
				this._inputExpr = match[2];
			} else {
				this._inputVar = 'x';
				this._inputExpr = value;
			}
			
			// Update the placeholder values from node input
			this.derivativeField.setPromptValue('var', this._inputVar, 'latex');
			this.derivativeField.setPromptValue('expr', this._inputExpr, 'latex');
			this._computeDerivative();
		}
	}

	focus() {
		this.derivativeField.focus();
		this.derivativeField.selection = this.derivativeField.getPromptRange("expr");
	}

	_computeDerivative() {
		const expr = this._inputExpr;
		const varName = this._inputVar;
		
		if (!expr) {
			this.derivativeField.setPromptValue('result', '', 'latex');
			if (this.outputs[0]) {
				this.outputs[0].changed('');
			}
			return;
		}
		
		// Compute symbolic derivative
		const derivative = this._differentiate(expr, varName);
		
		// Display the derivative in the result placeholder
		this.derivativeField.setPromptValue('result', derivative, 'latex');
		
		// Output the derivative function
		if (this.outputs[0]) {
			this.outputs[0].changed(`f(${varName}) = ${derivative}`);
		}
	}

	// Basic symbolic differentiation
	_differentiate(expr, varName) {
		expr = expr.trim();
		
		// Handle addition/subtraction (lowest precedence, split from right)
		let depth = 0;
		for (let i = expr.length - 1; i >= 0; i--) {
			const c = expr[i];
			if (c === ')' || c === '}') depth++;
			else if (c === '(' || c === '{') depth--;
			else if (depth === 0 && (c === '+' || c === '-') && i > 0) {
				const left = expr.slice(0, i).trim();
				const op = c;
				const right = expr.slice(i + 1).trim();
				if (left && right) {
					const dLeft = this._differentiate(left, varName);
					const dRight = this._differentiate(right, varName);
					return `${dLeft} ${op} ${dRight}`;
				}
			}
		}
		
		// Handle multiplication (split from right)
		depth = 0;
		for (let i = expr.length - 1; i >= 0; i--) {
			const c = expr[i];
			if (c === ')' || c === '}') depth++;
			else if (c === '(' || c === '{') depth--;
			else if (depth === 0 && c === '*') {
				const left = expr.slice(0, i).trim();
				const right = expr.slice(i + 1).trim();
				if (left && right) {
					// Product rule: d(uv) = u'v + uv'
					const dLeft = this._differentiate(left, varName);
					const dRight = this._differentiate(right, varName);
					return `(${dLeft}) * (${right}) + (${left}) * (${dRight})`;
				}
			}
		}
		
		// Handle division
		depth = 0;
		for (let i = expr.length - 1; i >= 0; i--) {
			const c = expr[i];
			if (c === ')' || c === '}') depth++;
			else if (c === '(' || c === '{') depth--;
			else if (depth === 0 && c === '/') {
				const left = expr.slice(0, i).trim();
				const right = expr.slice(i + 1).trim();
				if (left && right) {
					// Quotient rule: d(u/v) = (u'v - uv') / v^2
					const dLeft = this._differentiate(left, varName);
					const dRight = this._differentiate(right, varName);
					return `((${dLeft}) * (${right}) - (${left}) * (${dRight})) / (${right})^2`;
				}
			}
		}
		
		// Handle power: x^n or (expr)^n
		const powerMatch = expr.match(/^(.+)\^(.+)$/);
		if (powerMatch) {
			const base = powerMatch[1].trim();
			const exp = powerMatch[2].trim();
			
			// Simple case: x^n where n is constant
			if (base === varName && !exp.includes(varName)) {
				const n = parseFloat(exp);
				if (!isNaN(n)) {
					if (n === 1) return '1';
					if (n === 2) return `2${varName}`;
					return `${n}${varName}^{${n - 1}}`;
				}
			}
			
			// General power rule with chain rule
			if (!exp.includes(varName)) {
				const dBase = this._differentiate(base, varName);
				return `${exp} * (${base})^{${exp} - 1} * (${dBase})`;
			}
		}
		
		// Handle parentheses
		if (expr.startsWith('(') && expr.endsWith(')')) {
			return this._differentiate(expr.slice(1, -1), varName);
		}
		
		// Handle basic functions
		const funcMatch = expr.match(/^(\w+)\((.+)\)$/);
		if (funcMatch) {
			const func = funcMatch[1];
			const inner = funcMatch[2];
			const dInner = this._differentiate(inner, varName);
			
			switch (func) {
				case 'sin':
					return `\\cos(${inner}) * (${dInner})`;
				case 'cos':
					return `-\\sin(${inner}) * (${dInner})`;
				case 'tan':
					return `\\sec^2(${inner}) * (${dInner})`;
				case 'exp':
					return `\\exp(${inner}) * (${dInner})`;
				case 'ln':
				case 'log':
					return `\\frac{1}{${inner}} * (${dInner})`;
				case 'sqrt':
					return `\\frac{1}{2\\sqrt{${inner}}} * (${dInner})`;
			}
		}
		
		// Variable itself
		if (expr === varName) {
			return '1';
		}
		
		// Constant (number or other variable)
		if (!expr.includes(varName)) {
			return '0';
		}
		
		// Coefficient times variable: ax
		const coeffMatch = expr.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z])$/);
		if (coeffMatch && coeffMatch[2] === varName) {
			return coeffMatch[1];
		}
		
		// Fallback - return as derivative notation
		return `\\frac{d}{d${varName}}(${expr})`;
	}

	_ensurePlaceholderStyles() {
		const field = this.derivativeField;
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
		const root = this.derivativeField.shadowRoot || this.derivativeField;
		const vk = root.querySelector('.ML__virtual-keyboard-toggle');
		if (vk) vk.remove();
		const mt = root.querySelector('.ML__menu-toggle');
		if (mt) mt.remove();
	}
}

customElements.define("derivative-node", DerivativeNodeUI);

