import '../node_modules/mathlive/mathlive.min.mjs';
import mathml2latex from '../node_modules/mathml2latex/lib/mathml2latex.browser.es.js';

const mathliveStylesheetUrl = new URL(
  '../node_modules/mathlive/mathlive-static.css',
  import.meta.url
).href;

// Load API key from APIKEYS file
const nodeRequire = typeof window !== 'undefined' && typeof window.require === 'function'
  ? window.require
  : null;

let WOLFRAM_API_KEY = '';
if (nodeRequire) {
  const fs = nodeRequire('fs');
  const path = nodeRequire('path');
  const apiKeysPath = path.resolve(process.cwd(), 'APIKEYS');
  
  try {
    if (fs.existsSync(apiKeysPath)) {
      const apiKeysContent = fs.readFileSync(apiKeysPath, 'utf-8');
      const match = apiKeysContent.match(/WOLFRAM_API_KEY=(.+)/);
      if (match) {
        WOLFRAM_API_KEY = match[1].trim();
      }
    }
  } catch (error) {
    console.error('[Integral] Failed to read APIKEYS file:', error);
  }
}

if (!WOLFRAM_API_KEY) {
  console.warn('[Integral] WOLFRAM_API_KEY not found in APIKEYS file');
}

class IntegralNodeUI extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: "open" });

		this.shadowRoot.innerHTML = `
			<style>
				math-field {
					min-width: 100px;
					border-radius: 4px;
				}
				.loading {
					opacity: 0.5;
				}
			</style>
			<math-field class="integral" readonly></math-field>
		`;

		this.integralField = this.shadowRoot.querySelector('math-field');
		this.integralField.value = '\\int_{\\placeholder[lower]{}}^{\\placeholder[upper]{}} \\placeholder[expr]{} d\\placeholder[var]{x} = \\placeholder[result]{}';
		MathfieldElement.soundsDirectory = null;

		this._ensurePlaceholderStyles = this._ensurePlaceholderStyles.bind(this);

		customElements.whenDefined('math-field').then(() => {
			this._ensurePlaceholderStyles();
			this.integralField.addEventListener('focusin', this._ensurePlaceholderStyles);
		});

		this.inputs = [];
		this.outputs = [];
		
		this._inputExpr = '';
		this._inputVar = 'x';
		this._inputLower = '';
		this._inputUpper = '';
		this._pendingRequest = null;
		this._isComputing = false;
		this._lastComputedKey = null;
		this._lastFailedKey = null;
		this._debounceTimer = null;
		this.debounceTimeMs = 1000;
	}

	connectedCallback() {
		this.integralField.addEventListener('mount', () => {
			this._removeToggleButtons();
		});
		requestAnimationFrame(() => this._removeToggleButtons());

		this.integralField.addEventListener("input", () => {
			this._inputVar = this.integralField.getPromptValue('var') || 'x';
			this._inputExpr = this.integralField.getPromptValue('expr');
			this._inputLower = this.integralField.getPromptValue('lower') || '';
			this._inputUpper = this.integralField.getPromptValue('upper') || '';
			this._computeIntegral();
		});
		this.addEventListener("pointerdown", e => e.stopImmediatePropagation());
		this.addEventListener("pointerup", e => e.stopImmediatePropagation());
		this.addEventListener("click", e => e.stopPropagation());
	}

	disconnectedCallback() {
		this.integralField?.removeEventListener('focusin', this._ensurePlaceholderStyles);
	}

	inputChange(index, value) {
		if (typeof value === 'string') {
			if (index === 1) {
				// Expression input
				const match = value.match(/^f\((\w+)\)\s*=\s*(.+)$/);
				if (match) {
					this._inputVar = match[1];
					this._inputExpr = match[2];
				} else {
					this._inputVar = 'x';
					this._inputExpr = value;
				}
				
				// Display in the math field
				this.integralField.setPromptValue('var', this._inputVar, 'latex');
				this.integralField.setPromptValue('expr', this._inputExpr, 'latex');
			} else if (index === 2) {
				// Lower bound input - extract right side of =, empty means no bound
				const lowerMatch = value.match(/=\s*(.*)/);
				const lower = lowerMatch ? lowerMatch[1].trim() : '';
				this._inputLower = lower;
				this.integralField.setPromptValue('lower', this._inputLower, 'latex');
			} else if (index === 0) {
				// Upper bound input - extract right side of =, empty means no bound
				const upperMatch = value.match(/=\s*(.*)/);
				const upper = upperMatch ? upperMatch[1].trim() : '';
				this._inputUpper = upper;
				this.integralField.setPromptValue('upper', this._inputUpper, 'latex');
			}
			this._computeIntegral();
		}
	}

	focus() {
		this.integralField.focus();
		this.integralField.selection = this.integralField.getPromptRange("expr");
	}

	_computeIntegral() {
		// Debounce: wait 1 second after last input before computing
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}
		this._debounceTimer = setTimeout(() => this._doComputeIntegral(), this.debounceTimeMs);
	}

	_isValidExpression(expr) {
		// Skip incomplete or invalid expressions
		if (!expr || expr.length < 1) return false;
		// Skip if it's just whitespace or placeholders
		if (/^\s*$/.test(expr)) return false;
		// Skip if it contains unmatched braces
		const openBraces = (expr.match(/\{/g) || []).length;
		const closeBraces = (expr.match(/\}/g) || []).length;
		if (openBraces !== closeBraces) return false;
		// Skip if it ends with an operator or backslash (incomplete)
		if (/[+\-*/\\^_]$/.test(expr.trim())) return false;
		return true;
	}

	async _doComputeIntegral() {
		const expr = this._inputExpr;
		const varName = this._inputVar;
		const lower = this._inputLower;
		const upper = this._inputUpper;
		const computeKey = `${varName}:${expr}:${lower}:${upper}`;
		
		// Don't recompute if already computing or same as last computed
		if (this._isComputing) return;
		
		if (!expr) {
			if (this._lastComputedKey !== computeKey) {
				this._lastComputedKey = computeKey;
				this._setResult('');
				if (this.outputs[0]) {
					this.outputs[0].changed('');
				}
			}
			return;
		}
		
		// Skip incomplete expressions - just clear result, don't mark as failed
		if (!this._isValidExpression(expr)) {
			this._setResult('');
			return;
		}
		
		// Skip if same as last computed or last failed
		if (computeKey === this._lastComputedKey) return;
		if (computeKey === this._lastFailedKey) return;
		
		// Cancel any pending request
		if (this._pendingRequest) {
			this._pendingRequest.cancelled = true;
		}
		
		const request = { cancelled: false };
		this._pendingRequest = request;
		this._isComputing = true;
		
		// Show loading state
		this.integralField.classList.add('loading');
		this._setResult('...');
		
		try {
			const integral = await this._fetchIntegralFromWolfram(expr, varName, lower, upper);
			
			// Check if this request was cancelled
			if (request.cancelled) {
				this._isComputing = false;
				return;
			}
			
			this._lastComputedKey = computeKey;
			this._lastFailedKey = null;
			
			// Display the integral in the result placeholder
			this.integralField.classList.remove('loading');
			this._setResult(integral);
			
			// Output the integral result (definite integral gives a value, indefinite gives a function)
			if (this.outputs[0]) {
				const isDefinite = lower && upper;
				this.outputs[0].changed(isDefinite ? integral : `f(${varName}) = ${integral}`);
			}
		} catch (error) {
			if (request.cancelled) {
				this._isComputing = false;
				return;
			}
			
			this._lastFailedKey = computeKey;
			this.integralField.classList.remove('loading');
			// Just show ? on error - don't use \text{} which can break formatting
			this._setResult('?');
			if (this.outputs[0]) {
				this.outputs[0].changed('?');
			}
			console.log(error);
		} finally {
			this._isComputing = false;
		}
	}

	_setResult(value) {
		// Save current cursor position to prevent it from moving to the result
		const savedSelection = this.integralField.selection;
		this.integralField.setPromptValue('result', value, 'latex');
		// Restore cursor position after setting the result
		if (savedSelection) {
			this.integralField.selection = savedSelection;
		}
	}

	_sanitizeForWolfram(str) {
		// Remove invisible Unicode characters that MathLive inserts:
		// U+2062 (INVISIBLE TIMES), U+2061 (FUNCTION APPLICATION), 
		// U+2063 (INVISIBLE SEPARATOR), U+2064 (INVISIBLE PLUS)
		return str.replace(/[\u2061\u2062\u2063\u2064]/g, '');
	}

	async _fetchIntegralFromWolfram(expr, varName, lower, upper) {
		// Sanitize all inputs to remove invisible Unicode characters
		expr = this._sanitizeForWolfram(expr);
		lower = this._sanitizeForWolfram(lower);
		upper = this._sanitizeForWolfram(upper);
		
		const isDefinite = lower && upper;
		const query = isDefinite
			? `\\int_{${lower}}^{${upper}} \\left( ${expr} \\right) d${varName}`
			: `\\int \\left( ${expr} \\right) d${varName}`;
		const url = `https://api.wolframalpha.com/v2/query?appid=${WOLFRAM_API_KEY}&input=${encodeURIComponent(query)}&format=mathml&output=JSON`;
		
		const response = await fetch(url);
		
		// Read response as text first (can only read body once!)
		const responseText = await response.text();
		
		if (!response.ok) {
			console.error('[Integral] API error:', response.status, responseText);
			throw new Error(`Wolfram API error: ${response.status}`);
		}
		
		let data;
		try {
			data = JSON.parse(responseText);
		} catch (jsonError) {
			console.error('[Integral] Failed to parse JSON:', responseText);
			throw new Error('Failed to parse Wolfram response as JSON');
		}
		
		if (data.queryresult && data.queryresult.success) {
			// Look for the integral result in pods
			const pods = data.queryresult.pods || [];
			
			// Try to find the appropriate pod based on integral type (in priority order)
			const podIds = isDefinite
				? ['DefiniteIntegral', 'Result', 'Definite integral']
				: ['IndefiniteIntegral', 'AlternateFormOfTheIntegral', 'LogExpand', 'Result', 'Indefinite integral'];
			
			// Search pods in priority order
			for (const targetId of podIds) {
				for (const pod of pods) {
					if (pod.id === targetId || pod.title === targetId) {
						const subpods = pod.subpods || [];
						if (subpods.length > 0 && subpods[0].mathml) {
							let resultml = subpods[0].mathml;
							let result = mathml2latex.convert(resultml);
							// Clean up the result - extract just the integral expression
							// Remove patterns like "∫ f(x) dx = " or "f(x) = " or just "= "
							result = result.replace(/[\s\S]*=\s*/, '') || result;
							// Remove "(assuming a complex-valued logarithm)" or similar assumptions
							result = result.replace(/\s*\(assuming[^)]+\)/gi, '');
							// Convert "constant" to "c" (handle various formats) - only for indefinite
							if (!isDefinite) {
								result = result.replace(/\bconstant\b/gi, 'c');
							}
							// Trim any leading/trailing whitespace
							result = result.trim();
							return result;
						}
					}
				}
			}
			
			// No integral found in pods
			console.warn('[Integral] No integral found in response!');
			console.warn('[Integral] Original expression:', expr);
			console.warn('[Integral] Query sent:', query);
			console.warn('[Integral] Full response:', JSON.stringify(data.queryresult, null, 2));
		} else {
			// Query failed - log full response for debugging
			console.warn('[Integral] Query failed!');
			console.warn('[Integral] Original expression:', expr);
			console.warn('[Integral] Query sent:', query);
			console.warn('[Integral] Full response:', JSON.stringify(data.queryresult, null, 2));
		}
		
		throw new Error('Could not compute integral');
	}

	_ensurePlaceholderStyles() {
		const field = this.integralField;
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
		const root = this.integralField.shadowRoot || this.integralField;
		const vk = root.querySelector('.ML__virtual-keyboard-toggle');
		if (vk) vk.remove();
		const mt = root.querySelector('.ML__menu-toggle');
		if (mt) mt.remove();
	}
}

customElements.define("integral-node", IntegralNodeUI);

