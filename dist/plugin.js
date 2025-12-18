export const nodeTypes = [
	{
		typeId: "textNode",
		label: "Text Node",
		inputs: ["text"],
		outputs: ["text"],
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
	}
];

export function derive(func) {
}
