# DEVCON Kids UI foundation

This controlled redesign uses `src/styles/tokens.css` as the semantic bridge from the locked DEVCON Kids brand tokens to application components.

## Contrast-driven mappings

- Official purple `#7F08FF` remains the brand/focus accent. Purple 700 `#512DA8` and purple A700 `#6200EA` are used for accessible light-theme action text and fills.
- Official green `#71B406` remains a brand accent. Green 900 `#33691E` is used for light-theme success text.
- Official orange `#EA641D` remains a brand accent. Orange 900 `#E65100` is used for light-theme warning text.
- Official yellow `#E8CA04` is a controlled highlight and is never used for small text on white.
- Dark neutral `#464646` is the primary light-theme text color.

Dark theme uses lighter tonal values for readable foregrounds rather than inverting the interface. Status components pair color with labels and icons.

## Typography and assets

The temporary UI stack is `Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`. No Proxima Nova files are bundled. DEVCON must provide licensed webfont files and confirm web-embedding rights before Proxima Nova is used.

The supplied official logo is a 447 by 447 JPEG without transparency. It is copied without conversion and displayed with `object-fit: contain` on an intentional white surface. An approved transparent SVG or PNG is still required for flexible dark-surface and high-density use.

## Interaction rules

- Touch targets are at least 44 pixels where practical and event-editor controls are at least 48 pixels.
- Long event editing uses a full-page, three-stage flow.
- Events are saved only on the final stage. Stage changes make no database mutation.
- Private image upload begins only after the atomic event/coordinator save returns an event ID.
- Event save does not queue Google Workspace automation.
- The former Dashboard label is shown as Overview while its route remains `/dashboard`.
