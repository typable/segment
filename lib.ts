import {
  Dict,
  Figure,
  Props,
  ReactElement,
  HtmlFunction,
  ReactFunction,
  CreateFunction,
  Refs,
  Slices,
  Values,
} from './types.ts';

/**
 * Initializes the figure utility.
 * @param {CreateFunction} create - The React createElement function.
 * @return {Figure} The util functions collected in an object.
 */
export default function figure(create: CreateFunction): Figure {

  // the parser for interpreting HTML
  const parser = new DOMParser();
  // the counter for creating unique references
  let count = 0;

  /**
   * Returns the a function for rendering HTML.
   * @param {Dict} dict - The dictionary for resolving React components.
   * @return {Function} The function for rendering HTML.
   */
  function dict(dict?: Dict): HtmlFunction {

    /**
     * Converts the template literal HTML syntax into React elements.
     * @param {Slices} slices - The template literal slices
     * @param {Values} values - The template literal values
     * @return {ReactElement[]} The converted HTML as React elements.
     */
    function html(slices: Slices, ...values: Values): ReactElement[] {
      const [html, refs] = compose(slices, values);
      try {
        const dom = parser.parseFromString(html, 'text/html');
        // collect all nodes from head and body
        const nodes = [...dom.head.childNodes, ...dom.body.childNodes];
        return nodes.map((node) => render(node, refs, dict ?? {}));
      }
      catch (error) {
        console.error(error);
        throw 'Invalid DOM structure!';
      }
    }

    return html;
  }

  /**
   * Joins the template literal slices together and replaces the values with references.
   * The values are being mapped to there corresponding references and with the populated
   * HTML string returned.
   *
   * @param {Slices} slices - The template literal slices
   * @param {Values} values - The template literal values
   * @return {[string, Refs]} The joined HTML string and the values mapped to there references.
   */
  function compose(slices: Slices, values: Values): [string, Refs] {
    if (slices == null) {
      // handle dyn function without body
      return ['', {}];
    }
    const refs: Refs = {};
    let slice = '';
    for (let i = 0; i < slices.length; i++) {
      slice += slices[i];
      if (values[i] != null) {
        // create unique reference
        const uid = `$fig-${count++}`;
        refs[uid] = values[i];
        slice += uid ?? '';
      }
    }
    return [slice.trim(), refs];
  }

  /**
   * Injects the values into the corresponding reference locations of the string.
   *
   * @param {string} slice - The string containing references
   * @param {Refs} refs - The values mapped to there references
   * @return {ReactElement[]} The string populated with the passed values
   */
  function feed(slice: string, refs: Refs): ReactElement[] {
    const expr = /\$fig-\d+/g;
    const elements: ReactElement[] = [];
    let match: RegExpExecArray | null = null;
    let last = 0;
    while ((match = expr.exec(slice)) !== null) {
      const index = match.index;
      const uid = match[0];
      const before = slice.substring(last, index);
      // ignore empty strings
      if (before.length > 0) {
        elements.push(before);
      }
      const value = refs[uid];
      // ignore empty values
      if (value) {
        elements.push(value);
      }
      last = index + uid.length;
    }
    const after = slice.substring(last);
    // ignore empty strings
    if (after.length > 0) {
      elements.push(after);
    }
    return elements;
  }

  /**
   * Converts a HTML node into a React element.
   *
   * @param {Node} node - The HTML node
   * @param {Refs} refs - The values mapped to there references
   * @return {ReactElement[]} The converted HTML node as React element
   */
  function render(node: Node, refs: Refs, dict: Dict): ReactElement[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      if (text.textContent == null) {
        // ignore empty text nodes
        return [];
      }
      return feed(text.textContent, refs);
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      // ignore comments
      return [];
    }
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const props: Props = {};
    // iterate over each attribute and add it to the props
    for (const attribute of element.attributes) {
      const key = attribute.name;
      const slice = attribute.textContent;
      if (slice == null) {
        // ignore empty attribute values
        continue;
      }
      const values = feed(slice, refs);
      const value = values.length == 1 ? values[0] : values;
      let attr = key;
      const match = /^(\w+):(\w+)$/.exec(attr);
      if (match) {
        // camel case attribute name
        const [, pre, name] = match;
        attr = `${pre}${name.substring(0, 1).toUpperCase()}${name.substring(1)}`;
      }
      props[attr] = value instanceof Array ? value.join('') : value;
    }
    const children: ReactElement[] = [];
    // recursively render all child nodes
    (node.childNodes ?? []).forEach((child) => children.push(...render(child, refs, dict)));
    const domain = tag.split(':');
    // look up tag name in dictionary
    // deno-lint-ignore no-explicit-any
    const component: ReactFunction | null = domain.reduce((dict: any, level) => {
      return dict && dict[level] ? dict[level] : null;
    }, dict);
    // use React component or tag name
    return [create(component ?? tag, props, ...children)];
  }

  return { dict, dyn: create };
}
