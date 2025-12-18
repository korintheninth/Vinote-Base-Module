class TextNodeUI extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.innerHTML = `<textarea />`;
		
		const node = this;
		this.value = {
			_text: "",
			set text(val) {
				this._text = val;
				const ta = node.shadowRoot.querySelector("textarea");
				ta.value = val;
				node.outputs[0].changed(val);
				node.resize();
			},
			get text() {
				return this._text;
			}
		};
		this.inputs = [];
		this.outputs = [];
	}

	connectedCallback() {
		this.style.display = 'flex';

		const ta = this.shadowRoot.querySelector("textarea");
		ta.setAttribute("wrap", "off");
		ta.style.overflowY = "hidden";
		ta.style.overflowX = "hidden";

		this.resize();

		ta.addEventListener("input", e => {
			this.value.text = e.target.value;
		});
		this.addEventListener("pointerdown", e => e.stopImmediatePropagation());
		this.addEventListener("pointerup", e => e.stopImmediatePropagation());
		this.addEventListener("click", e => e.stopPropagation());
	}
	
	focus() {
		const ta = this.shadowRoot.querySelector("textarea");
		ta.focus();
	}

	resize() {
		const ta = this.shadowRoot.querySelector("textarea");
		ta.style.height = "auto";
		ta.style.width = "auto";
		ta.style.height = ta.scrollHeight + "px";
		ta.style.width = ta.scrollWidth + "px";
	}

	inputChange(index, value) {
		this.value.text = value;
	}
}

customElements.define("text-node", TextNodeUI);
