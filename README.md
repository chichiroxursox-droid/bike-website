# POISE

A scroll-driven product page for a made-up kids' balance bike, treated with deadpan luxury-brand seriousness.

**Live:** https://buymybike.netlify.app/

## Why it exists

Practice for the Apple-style product scroll, on a subject silly enough to make the design choices obvious.

## How it works

- **Frame playback.** 151 frames from a ~10 second product video are drawn to a canvas. A frame-speed multiplier of 1.85 finishes the bike animation around 54% of the scroll, so the rest of the page reads over the final frame.
- **Thermal mode.** A WebGL fragment shader reads the 2D canvas as a texture and maps luminance through a FLIR-style color ramp (black, purple, teal, orange, yellow, white). It cuts in with no fade between 45% and 62% of the scroll.
- **Horizontal section.** From 62% to 72% of the scroll, vertical scroll drives a horizontal track of panels.
- **Section system.** Sections declare `data-enter`, `data-leave` and `data-animation`. Stats count up and a marquee slides with scroll.

## Stack

Vanilla HTML, CSS and JS. Lenis and GSAP ScrollTrigger from CDNs, raw WebGL for the thermal shader. No build step.

## Run it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Credits

Built with Nate Herk's video-to-website Claude Code skill. The thermal shader and horizontal section are my additions. Design direction borrowed from the ORYZO site. POISE is not a real product.
