import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneSlider,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';

import { mountApp } from '../../core/hostRuntime';
import type { Http } from '../../core/types';
import { APP_HTML } from '../../app/appHtml';

export interface IFitGapAssessmentWebPartProps {
  catalogueList: string;
  assessmentsList: string;
  recordsList: string;
  height: number;
}

export default class FitGapAssessmentWebPart extends BaseClientSideWebPart<IFitGapAssessmentWebPartProps> {
  private unmount: (() => void) | undefined;

  public render(): void {
    if (this.unmount) this.unmount();
    const client = this.context.spHttpClient;
    const http: Http = {
      request: (method, url, body, headers) =>
        (method === 'GET'
          ? client.get(url, SPHttpClient.configurations.v1, { headers })
          : client.post(url, SPHttpClient.configurations.v1, { headers, body })) as any
    };
    const user = this.context.pageContext.user;
    this.unmount = mountApp({
      container: this.domElement,
      http,
      appHtml: APP_HTML,
      height: this.properties.height || 900,
      config: {
        webUrl: this.context.pageContext.web.absoluteUrl,
        catalogueList: this.properties.catalogueList || 'Fit Gap Process Catalogue',
        assessmentsList: this.properties.assessmentsList || 'Fit Gap Assessments',
        recordsList: this.properties.recordsList || 'Fit Gap Assessment Records',
        userName: user.displayName,
        userEmail: user.email
      }
    });
  }

  protected onDispose(): void {
    if (this.unmount) this.unmount();
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [{
        header: { description: 'SharePoint lists used by the dashboard (on this site).' },
        groups: [{
          groupName: 'Lists',
          groupFields: [
            PropertyPaneTextField('catalogueList', { label: 'Process catalogue list' }),
            PropertyPaneTextField('assessmentsList', { label: 'Assessments list' }),
            PropertyPaneTextField('recordsList', { label: 'Assessment records list' }),
            PropertyPaneSlider('height', { label: 'Height (px)', min: 500, max: 2000, step: 50 })
          ]
        }]
      }]
    };
  }
}
