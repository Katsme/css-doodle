import { create_svg_url, normalize_svg } from './utils/svg.js';
import { generate_svg } from './generator/svg.js';

import { cell_id, is_letter, is_nil, is_empty, add_alias, unique_id, lerp } from './utils/index.js';
import { lazy, clamp, sequence, get_value } from './utils/index.js';
import { by_unit, by_charcode } from './utils/transform.js';
import { last } from './utils/list.js';

import calc from './calc.js';
import { memo } from './utils/memo.js';
import { expand } from './utils/expand.js';
import Stack from './utils/stack.js';
import Noise from './utils/noise.js';
import get_named_arguments from './utils/get-named-arguments.js';

import { shapes, create_shape_points } from './generator/shapes.js';
import parse_value_group from './parser/parse-value-group.js';
import parse_shape_commands from './parser/parse-shape-commands.js';
import parse_svg from './parser/parse-svg.js';
import parse_svg_path from './parser/parse-svg-path.js';

import * as Uniforms from './uniforms.js';

function make_sequence(c) {
  return lazy((_, n, ...actions) => {
    if (!actions || !n) return '';
    let count = get_value(n());
    let evaluated = count;
    if (/\D/.test(count) && !/\d+[x-]\d+/.test(count)) {
      evaluated = calc(count);
      if (evaluated === 0) {
        evaluated = count;
      }
    }
    let signature = Math.random();
    return sequence(
      evaluated,
      (...args) => {
        return actions.map(action => {
          return get_value(action(...args, signature))
        }).join(',');
      }
    ).join(c);
  });
}

function push_stack(context, name, value) {
  if (!context[name]) context[name] = new Stack();
  context[name].push(value);
  return value;
}

function flip_value(num) {
  return -1 * num;
}

function map2d(value, min, max, amp = 1) {
  let dimention = 2;
  let v = Math.sqrt(dimention / 4) * amp;
  let [ma, mb] = [-v, v];
  return lerp((value - ma) / (mb - ma), min * amp, max * amp);
}

function calc_with(base) {
  return v => {
    if (is_empty(v) || is_empty(base)) {
      return base;
    }
    if (/^[+*-\/%][.\d\s]/.test(v)) {
      let op = v[0];
      let num = Number(v.substr(1).trim()) || 0;
      switch (op) {
        case '+': return base + num;
        case '-': return base - num;
        case '*': return base * num;
        case '/': return base / num;
        case '%': return base % num;
      }
    }
    else if (/[+*-\/%]$/.test(v)) {
      let op = v.substr(-1);
      let num = Number(v.substr(0, v.length - 1).trim()) || 0;
      switch (op) {
        case '+': return num + base;
        case '-': return num - base;
        case '*': return num * base;
        case '/': return num / base;
        case '%': return num % base;
      }
    }
    return base + (Number(v) || 0);
  }
}

const Expose = add_alias({

  i({ count }) {
    return calc_with(count);
  },

  y({ y }) {
    return calc_with(y);
  },

  x({ x }) {
    return calc_with(x);
  },

  z({ z }) {
    return calc_with(z);
  },

  I({ grid }) {
    return calc_with(grid.count);
  },

  Y({ grid }) {
    return calc_with(grid.y);
  },

  X({ grid }) {
    return calc_with(grid.x);
  },

  Z({ grid }) {
    return calc_with(grid.z);
  },

  id({ x, y, z }) {
    return _ => cell_id(x, y, z);
  },

  n({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[0]) : '@n';
  },

  nx({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[1]) : '@nx';
  },

  ny({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[2]) : '@ny';
  },

  N({ extra }) {
    let lastExtra = last(extra);
    return lastExtra ? calc_with(lastExtra[3]) : '@N';
  },

  m: make_sequence(','),

  M: make_sequence(' '),

  µ: make_sequence(''),

  p({ context, pick }) {
    return expand((...args) => {
      if (!args.length) {
        args = context.last_pick_args || [];
      }
      let picked = pick(args);
      context.last_pick_args = args;
      return push_stack(context, 'last_pick', picked);
    });
  },

  P({ context, pick, position }) {
    let counter = 'P-counter' + position;
    return expand((...args) => {
      let normal = true;
      if (!args.length) {
        args = context.last_pick_args || [];
        normal = false;
      }
      let stack = context.last_pick;
      let last = stack ? stack.last(1) : '';
      if (normal) {
        if (!context[counter]) {
          context[counter] = {};
        }
        last = context[counter].last_pick;
      }
      if (args.length > 1) {
        let i = args.findIndex(n => n === last);
        if (i !== -1) {
          args.splice(i, 1);
        }
      }
      let picked = pick(args);
      context.last_pick_args = args;
      if (normal) {
        context[counter].last_pick = picked;
      }
      return push_stack(context, 'last_pick', picked);
    });
  },

  pl({ context, extra, position }) {
    let lastExtra = last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = 'pl-counter' + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let [idx = context[counter]] = lastExtra || [];
      let pos = (idx - 1) % max;
      let value = args[pos];
      return push_stack(context, 'last_pick', value);
    });
  },

  pr({ context, extra, position }) {
    let lastExtra = last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = 'pr-counter' + position + sig;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      let max = args.length;
      let [idx = context[counter]] = lastExtra || [];
      let pos = (idx - 1) % max;
      let value = args[max - pos - 1];
      return push_stack(context, 'last_pick', value);
    });
  },

  pd({ context, extra, position, shuffle }) {
    let lastExtra = last(extra);
    let sig = lastExtra ? last(lastExtra) : '';
    let counter = 'pd-counter' + position  + sig;
    let values = 'pd-values' + position + sig;;
    return expand((...args) => {
      if (!context[counter]) context[counter] = 0;
      context[counter] += 1;
      if (!context[values]) {
        context[values] = shuffle(args || []);
      }
      let max = args.length;
      let [idx = context[counter]] = lastExtra || [];
      let pos = (idx - 1) % max;
      let value = context[values][pos];
      return push_stack(context, 'last_pick', value);
    });
  },

  lp({ context }) {
    return (n = 1) => {
      let stack = context.last_pick;
      return stack ? stack.last(n) : '';
    };
  },

  r({ context, rand }) {
    return (...args) => {
      let transform = args.every(is_letter)
        ? by_charcode
        : by_unit;
      let value = transform(rand)(...args);
      return push_stack(context, 'last_rand', value);
    };
  },

  rn({ x, y, context, position, grid, extra, shuffle }) {
    let counter = 'noise-2d' + position;
    let [ni, nx, ny, nm, NX, NY] = last(extra) || [];
    let isSeqContext = (ni && nm);
    return (...args) => {
      let {from = 0, to = from, frequency = 1, amplitude = 1} = get_named_arguments(args, [
        'from', 'to', 'frequency', 'amplitude'
      ]);

      if (args.length == 1) {
        [from, to] = [0, from];
      }
      if (!context[counter]) {
        context[counter] = new Noise(shuffle);
      }
      frequency = clamp(frequency, 0, Infinity);
      amplitude = clamp(amplitude, 0, Infinity);
      let transform = [from, to].every(is_letter) ? by_charcode : by_unit;
      let t = isSeqContext
        ? context[counter].noise((nx - 1)/NX * frequency, (ny - 1)/NY * frequency, 0)
        : context[counter].noise((x - 1)/grid.x * frequency, (y - 1)/grid.y * frequency, 0);
      let fn = transform((from, to) => map2d(t * amplitude, from, to, amplitude));
      let value = fn(from, to);
      return push_stack(context, 'last_rand', value);
    };
  },

  lr({ context }) {
    return (n = 1) => {
      let stack = context.last_rand;
      return stack ? stack.last(n) : '';
    };
  },

  noise({ context, grid, position, shuffle, ...rest }) {
    let vars = {
      i: rest.count, I: grid.count,
      x: rest.x, X: grid.x,
      y: rest.y, Y: grid.y,
      z: rest.z, Z: grid.z,
    };
    return (x, y, z = 0) => {
      let counter = 'raw-noise-2d' + position;
      if (!context[counter]) {
        context[counter] = new Noise(shuffle);
      }
      return context[counter].noise(
        calc(x, vars),
        calc(y, vars),
        calc(z, vars)
      );
    };
  },

  stripe() {
    return (...input) => {
      let colors = input.map(get_value);
      let max = colors.length;
      let default_count = 0;
      let custom_sizes = [];
      let prev;
      if (!max) {
        return '';
      }
      colors.forEach(step => {
        let [_, size] = parse_value_group(step);
        if (size !== undefined) custom_sizes.push(size);
        else default_count += 1;
      });
      let default_size = custom_sizes.length
        ? `(100% - ${custom_sizes.join(' - ')}) / ${default_count}`
        : `100% / ${max}`
      return colors.map((step, i) => {
        if (custom_sizes.length) {
          let [color, size] = parse_value_group(step);
          let prefix = prev ? (prev + ' + ') : '';
          prev = prefix + (size !== undefined ? size : default_size);
          return `${color} 0 calc(${ prev })`
        }
        return `${step} 0 ${100 / max * (i + 1)}%`
      })
      .join(',');
    }
  },

  calc() {
    return value => calc(get_value(value));
  },

  hex() {
    return value => parseInt(get_value(value)).toString(16);
  },

  svg: lazy((_, ...args) => {
    let value = args.map(input => get_value(input())).join(',');
    if (!value.startsWith('<')) {
      let parsed = parse_svg(value);
      value = generate_svg(parsed);
    }
    let svg = normalize_svg(value);
    return create_svg_url(svg);
  }),

  Svg: lazy((_, ...args) => {
    let value = args.map(input => get_value(input())).join(',');
    if (!value.startsWith('<')) {
      let parsed = parse_svg(value);
      value = generate_svg(parsed);
    }
    return normalize_svg(value);
  }),

  filter: lazy((upstream, ...args) => {
    let values = args.map(input => get_value(input()));
    let value = values.join(',');
    let id = unique_id('filter-');
    // shorthand
    if (values.every(n => /^[\d.]/.test(n) || (/^(\w+)/.test(n) && !/[{}<>]/.test(n)))) {
      let { frequency, scale = 1, octave, seed = upstream.seed, blur, erode, dilate } = get_named_arguments(values, [
        'frequency', 'scale', 'octave', 'seed', 'blur', 'erode', 'dilate'
      ]);
      value = `
        x: -20%;
        y: -20%;
        width: 140%;
        height: 140%;
      `;
      if (!is_nil(dilate)) {
        value += `
          feMorphology {
            operator: dilate;
            radius: ${dilate};
          }
        `
      }
      if (!is_nil(erode)) {
        value += `
          feMorphology {
            operator: erode;
            radius: ${erode};
          }
        `
      }
      if (!is_nil(blur)) {
        value += `
          feGaussianBlur {
            stdDeviation: ${blur};
          }
        `
      }
      if (!is_nil(frequency)) {
        let [bx, by = bx] = parse_value_group(frequency);
        octave = octave ? `numOctaves: ${octave};` : '';
        value += `
          feTurbulence {
            type: fractalNoise;
            baseFrequency: ${bx} ${by};
            seed: ${seed};
            ${octave}
          }
          feDisplacementMap {
            in: SourceGraphic;
            scale: ${scale};
          }
        `
      }
    }
    // new svg syntax
    if (!value.startsWith('<')) {
      let parsed = parse_svg(value, {
        type: 'block',
        name: 'filter'
      });
      value = generate_svg(parsed);
    }
    let svg = normalize_svg(value).replace(
      /<filter([\s>])/,
      `<filter id="${ id }"$1`
    );
    return create_svg_url(svg, id);
  }),

  'svg-pattern': lazy((_, ...args) => {
    let value = args.map(input => get_value(input())).join(',');
    let parsed = parse_svg(`
      viewBox: 0 0 1 1;
      preserveAspectRatio: xMidYMid slice;
      rect {
        width, height: 100%;
        fill: defs pattern { ${ value } }
      }
    `);
    let svg = generate_svg(parsed);
    return create_svg_url(svg);
  }),

  var() {
    return value => `var(${ get_value(value) })`;
  },

  ut() {
    return value => `var(--${ Uniforms.uniform_time.name })`;
  },

  uw() {
    return value => `var(--${ Uniforms.uniform_width.name })`;
  },

  uh() {
    return value => `var(--${ Uniforms.uniform_height.name })`;
  },

  ux() {
    return value => `var(--${ Uniforms.uniform_mousex.name })`;
  },

  uy() {
    return value => `var(--${ Uniforms.uniform_mousey.name })`;
  },

  plot({ count, context, extra, position, grid }) {
    let key = 'offset-points' + position;
    let lastExtra = last(extra);
    return commands => {
      let [idx = count, _, __, max = grid.count] = lastExtra || [];
      if (!context[key]) {
        let config = parse_shape_commands(commands);
        delete config['fill'];
        delete config['fill-rule'];
        delete config['frame'];
        config.points = max;
        context[key] = create_shape_points(config, {min: 1, max: 65536});
      }
      return context[key][idx - 1];
    };
  },

  Plot({ count, context, extra, position, grid }) {
    let key = 'Offset-points' + position;
    let lastExtra = last(extra);
    return commands => {
      let [idx = count, _, __, max = grid.count] = lastExtra || [];
      if (!context[key]) {
        let config = parse_shape_commands(commands);
        delete config['fill'];
        delete config['fill-rule'];
        delete config['frame'];
        config.points = max;
        config.unit = config.unit || 'none';
        context[key] = create_shape_points(config, {min: 1, max: 65536});
      }
      return context[key][idx - 1];
    };
  },

  shape() {
    return memo('shape-function', (type = '', ...args) => {
      type = String(type).trim();
      let points = [];
      if (type.length) {
        if (typeof shapes[type] === 'function') {
          points = shapes[type](args);
        } else {
          let commands = type;
          let rest = args.join(',');
          if (rest.length) {
            commands = type + ',' + rest;
          }
          let config = parse_shape_commands(commands);
          points = create_shape_points(config, {min: 3, max: 3600});
        }
      }
      return `polygon(${points.join(',')})`;
    });
  },

  doodle() {
    return value => value;
  },

  shaders() {
    return value => value;
  },

  canvas() {
    return value => value;
  },

  pattern() {
    return value => value;
  },

  invert() {
    return commands => {
      let parsed = parse_svg_path(commands);
      if (!parsed.valid) return commands;
      return parsed.commands.map(({ name, value }) => {
        switch (name) {
          case 'v': return 'h' + value.join(' ');
          case 'V': return 'H' + value.join(' ');
          case 'h': return 'v' + value.join(' ');
          case 'H': return 'V' + value.join(' ');
          default:  return name + value.join(' ');
        }
      }).join(' ');
    };
  },

  flipH() {
    return commands => {
      let parsed = parse_svg_path(commands);
      if (!parsed.valid) return commands;
      return parsed.commands.map(({ name, value }) => {
        switch (name) {
          case 'h':
          case 'H': return name + value.map(flip_value).join(' ');
          default:  return name + value.join(' ');
        }
      }).join(' ');
    };
  },

  flipV() {
    return commands => {
      let parsed = parse_svg_path(commands);
      if (!parsed.valid) return commands;
      return parsed.commands.map(({ name, value }) => {
        switch (name) {
          case 'v':
          case 'V': return name + value.map(flip_value).join(' ');
          default:  return name + value.join(' ');
        }
      }).join(' ');
    };
  },

  flip(...args) {
    let flipH = Expose.flipH(...args);
    let flipV = Expose.flipV(...args);
    return commands => {
      return flipV(flipH(commands));
    }
  },

  reverse() {
    return (...args) => {
      let commands = args.map(get_value);
      let parsed = parse_svg_path(commands.join(','));
      if (parsed.valid) {
        let result = [];
        for (let i = parsed.commands.length - 1; i >= 0; --i) {
          let { name, value } = parsed.commands[i];
          result.push(name + value.join(' '));
        }
        return result.join(' ');
      }
      return commands.reverse();
    }
  },

  cycle() {
    return (...args) => {
      let list = [];
      let separator;
      if (args.length == 1) {
        separator = ' ';;
        list = parse_value_group(args[0], { symbol: separator });
      } else {
        separator = ',';
        list = parse_value_group(args.map(get_value).join(separator), { symbol: separator});
      }
      let size = list.length - 1;
      let result = [list.join(separator)];
      // Just ignore the performance
      for (let i = 0; i < size; ++i) {
        let item = list.pop();
        list.unshift(item);
        result.push(list.join(separator));
      }
      return result;
    }
  },

  mirror() {
    return (...args) => {
      for (let i = args.length - 1; i >= 0; --i) {
        args.push(args[i]);
      }
      return args;
    }
  },

  Mirror() {
    return (...args) => {
      for (let i = args.length - 2; i >= 0; --i) {
        args.push(args[i]);
      }
      return args;
    }
  },

  unicode() {
    return (...args) => {
      return args.map(code => String.fromCharCode(code));
    }
  },

}, {

  'index': 'i',
  'col': 'x',
  'row': 'y',
  'depth': 'z',
  'rand': 'r',
  'pick': 'p',
  'pn':   'pl',
  'pnr':  'pr',

  // error prone
  'stripes': 'stripe',
  'strip':   'stripe',
  'patern':  'pattern',
  'flipv': 'flipV',
  'fliph': 'flipH',

  // legacy names, keep them before 1.0
  't': 'ut',
  'svg-filter': 'filter',
  'last-rand': 'lr',
  'last-pick': 'lp',
  'multiple': 'm',
  'multi': 'm',
  'rep': 'µ',
  'repeat': 'µ',
  'ms': 'M',
  's':  'I',
  'size': 'I',
  'sx': 'X',
  'size-x': 'X',
  'size-col': 'X',
  'max-col': 'X',
  'sy': 'Y',
  'size-y': 'Y',
  'size-row': 'Y',
  'max-row': 'Y',
  'sz': 'Z',
  'size-z': 'Z',
  'size-depth': 'Z',
  'pick-by-turn': 'pl',
  'pick-n': 'pl',
  'pick-d': 'pd',
  'offset': 'plot',
  'Offset': 'Plot',
  'point': 'plot',
  'Point': 'Plot',
  'paint': 'canvas',
});

export default Expose;
