
--- Guide for interactions-in-complex-layouts ---
# Optimizing Interactions in Complex Layouts

Maintain high frame rates (60FPS) and eliminate interaction latency during drag-and-drop or heavy mutations in complex, multi-column layouts like Kanban boards or massive data grids.

## Overview

In complex layouts, performing a minor change to a single item—such as dragging a card or editing a cell—can trigger a chain reaction of style and layout calculations that forces the browser to reflow the entire page. This results in dropped frames and high Interaction to Next Paint (INP) latency.

By applying `content-visibility: auto` to self-contained layout regions (like columns in a Kanban board), you can isolate rendering work.

### Mechanism for On-Screen Elements

It is important to understand how `content-visibility: auto` benefits elements that are **already visible on the screen**:

*   For visible elements, the browser **does not** skip rendering.
*   Instead, the performance benefit comes entirely from the **CSS containments** that the property automatically enforces (i.e., layout, style, and paint).
*   This containment acts as a boundary. If a mutation occurs inside a container with containment applied, the browser knows that the changes cannot affect the geometry or styles of elements outside that container. The page reflow is isolated, preventing a global layout recalculation.

## Implementation

### 1. Identify Containment Regions

Apply `content-visibility: auto` to large, self-contained containers that represent isolated layout units (e.g., grid columns, board lists).

```css
.board-column {
  /* Apply containment boundaries */
  content-visibility: auto;
  
  /* Mandatory: Provide a placeholder size to prevent layouts shifts.
     For a vertical column, define a reasonable width and height. 
     - 'auto' is optional and enables the browser to remember the actual size
       once rendered. It must be paired with a <length> value to be used for
       the first render.
     - '300px' is the estimated width of this element. This can be any valid
      CSS <length> value. Replace it with the expected width of your
      component.
     - '800px' is the estimated height of this element. This can be any valid
      CSS <length> value. Replace it with the expected height of your
      component.
   */
  contain-intrinsic-size: auto 300px auto 800px;
}
```

### 2. Manage Interactions

Ensure that interactions occurring inside the column benefit from the containment.

```javascript
// Example: Drag and drop item movement
function moveItemToColumn(itemId, columnId) {
  const item = document.getElementById(itemId);
  const column = document.getElementById(columnId);
  
  // The browser will only reflow this specific column, 
  // not the entire board layout!
  column.appendChild(item);
}
```

### Fallback strategies

Baseline status for content-visibility: Newly available. It's been Baseline since 2025-09-15.
Supported by: Chrome 108 (Nov 2022), Edge 108 (Dec 2022), Firefox 130 (Sep 2024), and Safari 26 (Sep 2025).

The property degrades gracefully. In unsupported browsers:
*   The property is ignored, and mutations will cause the standard global reflow.
*   To achieve a similar isolation effect in older browsers, you can fall back to applying containment manually:

```css
@supports not (content-visibility: auto) {
  .board-column {
    /* Manual fallback for containment */
    contain: layout style paint;
  }
}
```


--- Guide for scrollability-affordance-hints ---
## Overview

Visual hints, like shadows or gradients, help users understand that they can scroll to see more content. This guide shows how to build these hints using CSS `container-scroll-state-queries`, which allows styling elements based on the scrollable state of their container without relying on JavaScript scroll listeners or observers.

## Implementation

### 1. Establish the Scroll Container

The scroll container must be declared as a scroll-state query container.

```css
.scroller {
  overflow-y: auto;
  /* Establish this element as a scroll-state query container */
  container-type: scroll-state;
  position: relative;
}
```

### 2. Style the Indicators

Place the indicator elements (like shadows, gradients, or arrows) inside the container and style them. By default, they should not be visible. When they are shown, they should not be interactive, by setting `pointer-events: none`.

```css
.indicator-top, .indicator-bottom {
  position: sticky;
  left: 0;
  right: 0;
  height: 20px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none; /* Let clicks pass through */
}

.indicator-top {
  top: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.2), transparent); /* Example: Shadow */
}

.indicator-bottom {
  bottom: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.2), transparent); /* Example: Shadow */
}
```

### 3. Query the Scroll State

Use the `@container` rule with the `scroll-state` function. Check if the container is scrollable up or down to show the respective indicator.

```css
/* Show top indicator when the user can scroll up */
@container scroll-state(scrollable: top) {
  .indicator-top {
    opacity: 1;
  }
}

/* Show bottom indicator when the user can scroll down */
@container scroll-state(scrollable: bottom) {
  .indicator-bottom {
    opacity: 1;
  }
}
```

## Fallback strategies

Container scroll-state queries has limited availability.
Supported by: Chrome 133 (Feb 2025) and Edge 133 (Feb 2025).
Unsupported in: Firefox and Safari.

### Basic Fallback
If the feature is not supported, the indicators will remain invisible. Since these are hints and not critical for functionality, it is acceptable to omit them in unsupported browsers.

### Advanced Fallback (Intersection Observer)
If the hints are required, use an `IntersectionObserver` to toggle classes when sentinel elements at the top and bottom of the scroller move in and out of the scrollport.

```html
<!-- Sentinel elements placed at the ends of the scroller -->
<div class="sentinel-top"></div>
<!-- Content goes here -->
<div class="sentinel-bottom"></div>
```

```css
/* Marker styling to ensure it does not affect layout */
.sentinel-top, .sentinel-bottom {
  height: 0;
  width: 0;
  visibility: hidden;
}

.scroller.scrolled-down .indicator-top {
  opacity: 1;
}

.scroller.can-scroll-down .indicator-bottom {
  opacity: 1;
}
```

```javascript
if (!CSS.supports('container-type', 'scroll-state')) {
  const topSentinel = document.querySelector('.sentinel-top');
  const bottomSentinel = document.querySelector('.sentinel-bottom');
  const scroller = document.querySelector('.scroller');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.target === topSentinel) {
        // If top sentinel is not intersecting, we have scrolled down
        scroller.classList.toggle('scrolled-down', !entry.isIntersecting);
      }
      if (entry.target === bottomSentinel) {
        // If bottom sentinel is intersecting, we reached the bottom
        scroller.classList.toggle('can-scroll-down', !entry.isIntersecting);
      }
    });
  }, { root: scroller });

  observer.observe(topSentinel);
  observer.observe(bottomSentinel);
}
```


--- Guide for customize-scrollbar-color-and-thickness ---
# Customize the color or thickness of a scrollbar

You can customize the appearance of scrollbars using the standard CSS properties `scrollbar-color` and `scrollbar-width`.

*   **`scrollbar-color`**: Accepts two `<color>` values. The first applies to the thumb (the moving part), and the second to the track (the fixed background).
*   **`scrollbar-width`**: Accepts `auto` (default), `thin` (a thinner variant), or `none` (hides the scrollbar completely while maintaining scrollability).

## Apply `scrollbar-color` and `scrollbar-width`

MANDATORY: Use `scrollbar-color` and `scrollbar-width` on the scrollable container.

When using `scrollbar-color`, use CSS variables to keep thumb and track colors separate, for readability and maintainability (especially when using fallbacks).

```css
.scroller {
  --scrollbar-thumb: var(--color-neutral-70);
  --scrollbar-track: var(--color-neutral-90);

  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
```

## Fallback strategies

Baseline status for scrollbar-width: Newly available. It's been Baseline since 2024-12-11.
Supported by: Chrome 121 (Jan 2024), Edge 121 (Jan 2024), Firefox 64 (Dec 2018), and Safari 18.2 (Dec 2024).

### Fallbacks & browser support for scrollbar-color

Baseline status for scrollbar-color: Newly available. It's been Baseline since 2025-12-12.
Supported by: Chrome 121 (Jan 2024), Edge 121 (Jan 2024), Firefox 64 (Dec 2018), and Safari 26.2 (Dec 2025).

This feature is progressive enhancement and does not always require fallbacks.

If the styling is important and the user's Baseline target is "Baseline Widely Available" or earlier, you SHOULD include the non-standard `::-webkit-scrollbar` pseudo-elements as fallbacks.

Wrap legacy fallbacks in an `@supports not (scrollbar-color: auto)` block to prevent conflicts between standard properties and legacy WebKit selectors in browsers that support both natively.

If you are using custom properties to define colors, these will cascade to the legacy WebKit selectors automatically. You do NOT need to duplicate them.

```css
/* Legacy fallback for WebKit/Blink browsers */
@supports not (scrollbar-color: auto) {
  .scroller::-webkit-scrollbar {
    /* Must define base size in WebKit for custom colors to be visual */
    width: 12px;
    height: 12px;
  }

  .scroller::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
  }

  .scroller::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
}
```


