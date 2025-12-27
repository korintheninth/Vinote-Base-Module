export const nodeTypes = [
	{
		typeId: "textNode",
		label: "Text Node",
		inputs: ["any"],
		outputs: ["any"],
		logic: {
		},
		uiComponentTag: "text-node"
	},
	{
		typeId: "functionNode",
		label: "Function Node",
		inputs: [],
		outputs: ["function"],
		logic: {
			derive,
		},
		uiComponentTag: "function-node"
	},
	{
		typeId: "derivativeNode",
		label: "Derivative Node",
		inputs: ["function"],
		outputs: ["function"],
		logic: {
		},
		uiComponentTag: "derivative-node"
	},
	{
		typeId: "integralNode",
		label: "Integral Node",
		inputs: ["function", "function", "function"],
		outputs: ["function"],
		logic: {
		},
		uiComponentTag: "integral-node"
	}
];

export function derive(func) {
}
