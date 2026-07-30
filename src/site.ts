
/*
 * Site
 */

import { IModule, Page } from "@sygnal/sse-core";


export class Site implements IModule {

  constructor() {
  }

  /**
   * Setup code runs synchronously, inline, at the end of the </head>. 
   * It's used for special init tasks that must be performed early, and which do not require
   * the DOM to be loaded. 
   */
  setup() {

    // Injects dist/css/site.css from the same CDN path as this bundle, so the
    // components' pre-init states are in place before the DOM paints. No <link>
    // is needed in the Webflow custom code.
    Page.loadEngineCSS("site.css");

  }

  /**
   * Exec code runs after the DOM has processed. 
   */
  exec() {

    // Put your site-level custom code here
    // it will have full access to the DOM 

  }

}
