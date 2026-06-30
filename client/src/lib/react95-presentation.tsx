import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import * as React95 from "react95/dist/index.mjs";
import { usePresentationShell } from "./presentation-shell";

const Original = React95 as any;

const gammaBase: CSSProperties = {
  boxSizing: "border-box",
  color: "var(--gamma-milk, #f2ead9)",
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
  letterSpacing: 0,
};

const gammaMono: CSSProperties = {
  fontFamily: "var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace)",
  letterSpacing: 0,
};

const gammaPanel: CSSProperties = {
  ...gammaBase,
  background: "color-mix(in srgb, var(--gamma-panel, #11110f) 76%, var(--gamma-ink, #070706))",
  border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
  borderRadius: 6,
};

type AnyProps = Record<string, any>;

function isGamma() {
  return usePresentationShell().host === "gamma";
}

function mergeStyle(...styles: Array<CSSProperties | undefined>): CSSProperties {
  return Object.assign({}, ...styles.filter(Boolean));
}

function omitPresentationProps<T extends AnyProps>(props: T, keys: string[] = []) {
  const next: AnyProps = { ...props };
  for (const key of [
    "active",
    "fullWidth",
    "menuMaxHeight",
    "open",
    "primary",
    "resizable",
    "resizeRef",
    "shadow",
    "square",
    "variant",
    "width",
    ...keys,
  ]) {
    delete next[key];
  }
  return next;
}

export const styleReset = Original.styleReset;
export const createScrollbars = Original.createScrollbars;

export const Button = forwardRef<HTMLButtonElement, AnyProps>(function Button(
  props,
  ref
) {
  if (!isGamma()) return <Original.Button ref={ref} {...props} />;
  const {
    children,
    className,
    disabled,
    fullWidth,
    primary,
    square,
    style,
    type = "button",
    ...rest
  } = props;
  return (
    <button
      ref={ref}
      className={className}
      type={type}
      disabled={disabled}
      data-gamma-ui="button"
      {...omitPresentationProps(rest)}
      style={mergeStyle(
        {
          ...gammaBase,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.45rem",
          width: fullWidth ? "100%" : square ? "2.5rem" : undefined,
          minWidth: square ? "2.5rem" : undefined,
          minHeight: square ? "2.5rem" : "2.45rem",
          padding: square ? 0 : "0.45rem 0.72rem",
          background: primary
            ? "var(--gamma-cyan, #00d2ff)"
            : "transparent",
          color: primary
            ? "var(--gamma-ink, #070706)"
            : "var(--gamma-cyan, #00d2ff)",
          border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
          borderColor: primary
            ? "var(--gamma-cyan, #00d2ff)"
            : "var(--gamma-line, rgba(242, 234, 217, 0.18))",
          borderRadius: 5,
          font: "inherit",
          fontWeight: 800,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.52 : 1,
        },
        style
      )}
    >
      {children}
    </button>
  );
});

export const Anchor = forwardRef<HTMLAnchorElement, AnyProps>(function Anchor(
  props,
  ref
) {
  if (!isGamma()) return <Original.Anchor ref={ref} {...props} />;
  return (
    <a
      ref={ref}
      data-gamma-ui="anchor"
      {...props}
      style={mergeStyle(
        {
          color: "var(--gamma-cyan, #00d2ff)",
          textDecoration: "underline",
          textUnderlineOffset: "0.18em",
        },
        props.style
      )}
    />
  );
});

export const GroupBox = forwardRef<HTMLFieldSetElement, AnyProps>(function GroupBox(
  props,
  ref
) {
  if (!isGamma()) return <Original.GroupBox ref={ref} {...props} />;
  const { children, className, label, style, ...rest } = props;
  return (
    <fieldset
      ref={ref}
      className={className}
      data-gamma-ui="groupbox"
      {...omitPresentationProps(rest)}
      style={mergeStyle(
        {
          ...gammaPanel,
          minWidth: 0,
          margin: 0,
          padding: "0.95rem",
        },
        style
      )}
    >
      {label ? (
        <legend
          style={{
            ...gammaMono,
            padding: "0 0.35rem",
            color: "var(--gamma-cyan, #00d2ff)",
            fontSize: "0.76rem",
            fontWeight: 900,
            textTransform: "uppercase",
          }}
        >
          {label}
        </legend>
      ) : null}
      {children}
    </fieldset>
  );
});

export const Fieldset = GroupBox;

export const Panel = forwardRef<HTMLDivElement, AnyProps>(function Panel(props, ref) {
  if (!isGamma()) return <Original.Panel ref={ref} {...props} />;
  return (
    <div
      ref={ref}
      data-gamma-ui="panel"
      {...omitPresentationProps(props)}
      style={mergeStyle(
        {
          ...gammaPanel,
          minWidth: 0,
          padding: "0.85rem",
        },
        props.style
      )}
    />
  );
});

export const Window = forwardRef<HTMLDivElement, AnyProps>(function Window(
  props,
  ref
) {
  if (!isGamma()) return <Original.Window ref={ref} {...props} />;
  return (
    <section
      ref={ref}
      data-gamma-ui="window"
      {...omitPresentationProps(props)}
      style={mergeStyle(
        {
          ...gammaPanel,
          display: "grid",
          minWidth: 0,
          overflow: "hidden",
        },
        props.style
      )}
    />
  );
});

export const WindowHeader = forwardRef<HTMLDivElement, AnyProps>(
  function WindowHeader(props, ref) {
    if (!isGamma()) return <Original.WindowHeader ref={ref} {...props} />;
    return (
      <header
        ref={ref}
        data-gamma-ui="window-header"
        {...omitPresentationProps(props)}
        style={mergeStyle(
          {
            ...gammaMono,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: "2.9rem",
            padding: "0.65rem 0.8rem",
            color: "var(--gamma-milk, #f2ead9)",
            borderBottom: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
            fontWeight: 900,
            textTransform: "uppercase",
          },
          props.style
        )}
      />
    );
  }
);

export const WindowContent = forwardRef<HTMLDivElement, AnyProps>(
  function WindowContent(props, ref) {
    if (!isGamma()) return <Original.WindowContent ref={ref} {...props} />;
    return (
      <div
        ref={ref}
        data-gamma-ui="window-content"
        {...omitPresentationProps(props)}
        style={mergeStyle(
          {
            ...gammaBase,
            minWidth: 0,
            padding: "0.95rem",
          },
          props.style
        )}
      />
    );
  }
);

function inputStyle(fullWidth?: boolean): CSSProperties {
  return {
    ...gammaBase,
    width: fullWidth ? "100%" : undefined,
    minHeight: "2.35rem",
    padding: "0.42rem 0.55rem",
    background: "var(--gamma-ink, #070706)",
    color: "var(--gamma-milk, #f2ead9)",
    border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
    borderRadius: 4,
    outlineColor: "var(--gamma-cyan, #00d2ff)",
  };
}

export const TextInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, AnyProps>(
  function TextInput(props, ref) {
    if (!isGamma()) return <Original.TextInput ref={ref as any} {...props} />;
    const { className, fullWidth, multiline, style, ...rest } = props;
    const Comp = multiline ? "textarea" : "input";
    return (
      <Comp
        ref={ref as any}
        className={className}
        data-gamma-ui="text-input"
        {...omitPresentationProps(rest)}
        style={mergeStyle(
          inputStyle(fullWidth),
          multiline ? { minHeight: "5.5rem", resize: "vertical" } : undefined,
          style
        )}
      />
    );
  }
);

export const TextField = TextInput;

type GammaSelectOption<T = any> = {
  label: ReactNode;
  value: T;
  disabled?: boolean;
};

type GammaSelectProps<T = any> = AnyProps & {
  options?: Array<GammaSelectOption<T>>;
  value?: T;
  defaultValue?: T;
  onChange?: (event: any) => void;
};

export const Select = forwardRef<HTMLSelectElement, GammaSelectProps>(
  function Select(props, ref) {
    if (!isGamma()) return <Original.Select ref={ref as any} {...props} />;
    const {
      className,
      defaultValue,
      fullWidth,
      onChange,
      options,
      style,
      value,
      width,
      ...rest
    } = props;
    const serializedValue = value == null ? undefined : String(value);
    const serializedDefault =
      defaultValue == null ? undefined : String(defaultValue);
    const handleChange = (event: any) => {
      if (!onChange) return;
      if (Array.isArray(options)) {
        const selected = options.find((option) => String(option.value) === event.currentTarget.value);
        onChange(selected ?? { value: event.currentTarget.value, label: event.currentTarget.value });
        return;
      }
      onChange(event);
    };
    return (
      <select
        ref={ref}
        className={className}
        data-gamma-ui="select"
        value={serializedValue}
        defaultValue={serializedDefault}
        onChange={handleChange}
        {...omitPresentationProps(rest)}
        style={mergeStyle(
          inputStyle(fullWidth),
          {
            width: fullWidth ? "100%" : width,
            minWidth: width,
            cursor: props.disabled ? "not-allowed" : "pointer",
          },
          style
        )}
      >
        {Array.isArray(options)
          ? options.map((option) => (
              <option
                key={String(option.value)}
                value={String(option.value)}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))
          : props.children}
      </select>
    );
  }
) as <T = any>(
  props: GammaSelectProps<T> & { ref?: React.ForwardedRef<HTMLSelectElement> }
) => ReactElement;

export const Checkbox = forwardRef<HTMLInputElement, AnyProps>(function Checkbox(
  props,
  ref
) {
  if (!isGamma()) return <Original.Checkbox ref={ref} {...props} />;
  const { className, label, style, ...rest } = props;
  return (
    <label
      className={className}
      data-gamma-ui="checkbox"
      style={mergeStyle(
        {
          ...gammaBase,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.45rem",
          minHeight: "2.2rem",
          cursor: props.disabled ? "not-allowed" : "pointer",
        },
        style
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        {...omitPresentationProps(rest, ["label", "indeterminate"])}
        style={{
          width: "1rem",
          height: "1rem",
          accentColor: "var(--gamma-cyan, #00d2ff)",
        }}
      />
      {label != null ? <span>{label}</span> : null}
    </label>
  );
});

export const Separator = forwardRef<HTMLHRElement, AnyProps>(function Separator(
  props,
  ref
) {
  if (!isGamma()) return <Original.Separator ref={ref} {...props} />;
  return (
    <hr
      ref={ref}
      data-gamma-ui="separator"
      {...omitPresentationProps(props)}
      style={mergeStyle(
        {
          width: "100%",
          border: 0,
          borderTop: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
          margin: "0.65rem 0",
        },
        props.style
      )}
    />
  );
});

export const Hourglass = forwardRef<HTMLSpanElement, AnyProps>(function Hourglass(
  props,
  ref
) {
  if (!isGamma()) return <Original.Hourglass ref={ref} {...props} />;
  const { size, style, ...rest } = props;
  const dimension = typeof size === "number" ? size : 28;
  return (
    <span
      ref={ref}
      role="status"
      aria-label={props["aria-label"] ?? "Loading"}
      data-gamma-ui="hourglass"
      {...omitPresentationProps(rest)}
      style={mergeStyle(
        {
          ...gammaMono,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: dimension,
          height: dimension,
          color: "var(--gamma-cyan, #00d2ff)",
          border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
          borderRadius: 4,
          fontSize: Math.max(11, Math.floor(dimension * 0.38)),
          fontWeight: 900,
        },
        style
      )}
    >
      ...
    </span>
  );
});

export const ProgressBar = forwardRef<HTMLDivElement, AnyProps>(
  function ProgressBar(props, ref) {
    if (!isGamma()) return <Original.ProgressBar ref={ref} {...props} />;
    const value = Number(props.value ?? 0);
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number.isFinite(value) ? value : 0}
        data-gamma-ui="progress"
        {...omitPresentationProps(props)}
        style={mergeStyle(
          {
            height: "0.82rem",
            minWidth: "8rem",
            overflow: "hidden",
            background: "var(--gamma-ink, #070706)",
            border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
            borderRadius: 4,
          },
          props.style
        )}
      >
        <span
          style={{
            display: "block",
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: "100%",
            background: "var(--gamma-cyan, #00d2ff)",
          }}
        />
      </div>
    );
  }
);

export const AppBar = forwardRef<HTMLDivElement, AnyProps>(function AppBar(
  props,
  ref
) {
  if (!isGamma()) return <Original.AppBar ref={ref} {...props} />;
  return (
    <div
      ref={ref}
      data-gamma-ui="appbar"
      {...omitPresentationProps(props)}
      style={mergeStyle(
        {
          ...gammaPanel,
          display: "flex",
          alignItems: "center",
          minHeight: "3rem",
          padding: "0.45rem 0.7rem",
        },
        props.style
      )}
    />
  );
});

export const Toolbar = forwardRef<HTMLDivElement, AnyProps>(function Toolbar(
  props,
  ref
) {
  if (!isGamma()) return <Original.Toolbar ref={ref} {...props} />;
  return (
    <div
      ref={ref}
      data-gamma-ui="toolbar"
      {...omitPresentationProps(props)}
      style={mergeStyle(
        {
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.45rem",
          minHeight: "2.75rem",
          padding: "0.4rem",
          border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
          borderRadius: 6,
        },
        props.style
      )}
    />
  );
});

export const MenuList = forwardRef<HTMLUListElement, AnyProps>(function MenuList(
  props,
  ref
) {
  if (!isGamma()) return <Original.MenuList ref={ref} {...props} />;
  return (
    <ul
      ref={ref}
      role={props.role ?? "menu"}
      data-gamma-ui="menu-list"
      {...omitPresentationProps(props)}
      style={mergeStyle(
        {
          ...gammaPanel,
          display: "grid",
          gap: "0.2rem",
          listStyle: "none",
          margin: 0,
          padding: "0.35rem",
        },
        props.style
      )}
    />
  );
});

export const MenuListItem = forwardRef<HTMLLIElement, AnyProps>(
  function MenuListItem(props, ref) {
    if (!isGamma()) return <Original.MenuListItem ref={ref} {...props} />;
    return (
      <li
        ref={ref}
        role={props.role ?? "menuitem"}
        data-gamma-ui="menu-list-item"
        {...omitPresentationProps(props)}
        style={mergeStyle(
          {
            ...gammaBase,
            minHeight: "2.2rem",
            padding: "0.42rem 0.55rem",
            borderRadius: 4,
            cursor: props.disabled ? "not-allowed" : "pointer",
            opacity: props.disabled ? 0.52 : 1,
          },
          props.style
        )}
      />
    );
  }
);

export const Tabs = forwardRef<HTMLDivElement, AnyProps>(function Tabs(props, ref) {
  if (!isGamma()) return <Original.Tabs ref={ref} {...props} />;
  const { children, onChange, value, ...rest } = props;
  const enhanced = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const childProps = child.props as AnyProps;
    return cloneElement(child as ReactElement<AnyProps>, {
      "aria-selected": childProps.value === value,
      onClick: (event: any) => {
        childProps.onClick?.(event);
        onChange?.(childProps.value, event);
      },
    });
  });
  return (
    <div
      ref={ref}
      role={props.role ?? "tablist"}
      data-gamma-ui="tabs"
      {...omitPresentationProps(rest, ["onChange", "value", "rows"])}
      style={mergeStyle(
        {
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          borderBottom: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
        },
        props.style
      )}
    >
      {enhanced}
    </div>
  );
});

export const Tab = forwardRef<HTMLButtonElement, AnyProps>(function Tab(props, ref) {
  if (!isGamma()) return <Original.Tab ref={ref} {...props} />;
  const { children, style, ...rest } = props;
  const selected = Boolean(props["aria-selected"]);
  return (
    <button
      ref={ref}
      type="button"
      role={props.role ?? "tab"}
      data-gamma-ui="tab"
      {...omitPresentationProps(rest)}
      style={mergeStyle(
        {
          ...gammaMono,
          minHeight: "2.4rem",
          padding: "0.45rem 0.7rem",
          background: selected
            ? "var(--gamma-cyan, #00d2ff)"
            : "transparent",
          color: selected
            ? "var(--gamma-ink, #070706)"
            : "var(--gamma-cyan, #00d2ff)",
          border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
          borderBottomColor: selected
            ? "var(--gamma-cyan, #00d2ff)"
            : "var(--gamma-line, rgba(242, 234, 217, 0.18))",
          borderRadius: "5px 5px 0 0",
          cursor: "pointer",
          fontWeight: 900,
        },
        style
      )}
    >
      {children}
    </button>
  );
});

export const TabBody = forwardRef<HTMLDivElement, AnyProps>(function TabBody(
  props,
  ref
) {
  if (!isGamma()) return <Original.TabBody ref={ref} {...props} />;
  return (
    <div
      ref={ref}
      data-gamma-ui="tab-body"
      {...omitPresentationProps(props)}
      style={mergeStyle(
        {
          ...gammaBase,
          minWidth: 0,
          padding: "0.85rem 0",
        },
        props.style
      )}
    />
  );
});

function tableDisplay(
  props: HTMLAttributes<HTMLElement>,
  display: CSSProperties["display"],
  extra?: CSSProperties
) {
  return mergeStyle({ ...gammaBase, display, minWidth: 0 }, extra, props.style as CSSProperties);
}

export const Table = forwardRef<HTMLTableElement, AnyProps>(function Table(
  props,
  ref
) {
  if (!isGamma()) return <Original.Table ref={ref} {...props} />;
  return (
    <table
      ref={ref}
      data-gamma-ui="table"
      {...omitPresentationProps(props)}
      style={tableDisplay(props, "table", {
        width: "100%",
        borderCollapse: "collapse",
        border: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
      })}
    />
  );
});

export const TableHead = forwardRef<HTMLTableSectionElement, AnyProps>(
  function TableHead(props, ref) {
    if (!isGamma()) return <Original.TableHead ref={ref} {...props} />;
    return <thead ref={ref} data-gamma-ui="table-head" {...omitPresentationProps(props)} style={tableDisplay(props, "table-header-group")} />;
  }
);

export const TableBody = forwardRef<HTMLTableSectionElement, AnyProps>(
  function TableBody(props, ref) {
    if (!isGamma()) return <Original.TableBody ref={ref} {...props} />;
    return <tbody ref={ref} data-gamma-ui="table-body" {...omitPresentationProps(props)} style={tableDisplay(props, "table-row-group")} />;
  }
);

export const TableRow = forwardRef<HTMLTableRowElement, AnyProps>(function TableRow(
  props,
  ref
) {
  if (!isGamma()) return <Original.TableRow ref={ref} {...props} />;
  return <tr ref={ref} data-gamma-ui="table-row" {...omitPresentationProps(props)} style={tableDisplay(props, "table-row")} />;
});

export const TableHeadCell = forwardRef<HTMLTableCellElement, AnyProps>(
  function TableHeadCell(props, ref) {
    if (!isGamma()) return <Original.TableHeadCell ref={ref} {...props} />;
    return (
      <th
        ref={ref}
        data-gamma-ui="table-head-cell"
        {...omitPresentationProps(props)}
        style={mergeStyle(
          {
            ...gammaMono,
            padding: "0.52rem 0.6rem",
            color: "var(--gamma-cyan, #00d2ff)",
            borderBottom: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.18))",
            fontSize: "0.76rem",
            fontWeight: 900,
            textAlign: "left",
            textTransform: "uppercase",
          },
          props.style
        )}
      />
    );
  }
);

export const TableDataCell = forwardRef<HTMLTableCellElement, AnyProps>(
  function TableDataCell(props, ref) {
    if (!isGamma()) return <Original.TableDataCell ref={ref} {...props} />;
    return (
      <td
        ref={ref}
        data-gamma-ui="table-data-cell"
        {...omitPresentationProps(props)}
        style={mergeStyle(
          {
            ...gammaBase,
            padding: "0.52rem 0.6rem",
            borderTop: "1px solid var(--gamma-line, rgba(242, 234, 217, 0.12))",
            verticalAlign: "top",
          },
          props.style
        )}
      />
    );
  }
);

export const Tooltip = forwardRef<HTMLSpanElement, AnyProps>(function Tooltip(
  props,
  ref
) {
  if (!isGamma()) return <Original.Tooltip ref={ref} {...props} />;
  const { children, text, style, ...rest } = props;
  return (
    <span
      ref={ref}
      title={typeof text === "string" ? text : undefined}
      data-gamma-ui="tooltip"
      {...omitPresentationProps(rest)}
      style={mergeStyle({ display: "inline-flex" }, style)}
    >
      {children}
    </span>
  );
});
