/*
  - Copyright (c) 2014-2016 Cloudware S.A. All rights reserved.
  -
  - This file is part of casper-login.
  -
  - casper-login is free software: you can redistribute it and/or modify
  - it under the terms of the GNU Affero General Public License as published by
  - the Free Software Foundation, either version 3 of the License, or
  - (at your option) any later version.
  -
  - casper-login  is distributed in the hope that it will be useful,
  - but WITHOUT ANY WARRANTY; without even the implied warranty of
  - MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  - GNU General Public License for more details.
  -
  - You should have received a copy of the GNU Affero General Public License
  - along with casper-login.  If not, see <http://www.gnu.org/licenses/>.
  -
*/

import { platformConfiguration } from '/platform-configuration.js';
import '@polymer/iron-icons/iron-icons.js';
import '@polymer/paper-input/paper-input.js';
import '@polymer/paper-toast/paper-toast.js';
import '@casper2020/casper-icons/casper-icons.js';
import '@casper2020/casper-button/casper-button.js';
import '@casper2020/casper-socket/casper-socket.js';
import { PolymerElement, html } from '@polymer/polymer/polymer-element.js'

class CasperRecoverPassword extends PolymerElement {

  static get template () {
    return html`
      <style>
        :host {
          display: block;
          tabindex: -1;
          margin-bottom: 20px;
        }

        paper-input, paper-checkbox {
          display: block;
        }

        paper-checkbox {
          margin-top: 12px;
        }

        paper-input {
          width: 100%;
        }

        #spin {
          width: 16px;
          height: 16px;
          display: none;
          padding-right: 6px;
          --paper-spinner-color: #ccc;
        }

        #spin[active] {
          display: inline-flex;
        }

        casper-button{
          margin-right: 0;
        }

        #toast {
          --paper-toast-background-color: #f12424;
          --paper-toast-color: white;
          width: 100%;
          font-weight: bold;
          display: inline-flex;
          justify-content: space-between;
          align-items: center;
        }

        #toast[success]{
          --paper-toast-background-color: #4a9a4a;
          --paper-toast-color: white;
        }

        .user_actions a {
          text-align: center;
          color: var(--primary-color);
          text-decoration: none;
          display: none;
        }

        .user_actions a:hover {
          text-decoration: underline;
        }

        #forget_button {
          visibility: hidden;
        }

        .buttons {
          margin-top: 16px;
        }

        #redirect{
          display: none;
          line-height: 36px;
          text-align: center;
          background-color: #e8e8e8;
          border-radius: 3px;
          color: var(--primary-color);
        }

        #redirect a {
          text-decoration: underline;
          color: var(--primary-color);
        }

      </style>
        <casper-socket id="socket" tube-prefix="[[tubePrefix]]" cookie-domain=[[cookieDomain]] extra-options="[[socketOptions]]"></casper-socket>
        <paper-input disabled value="[[user_email]]" id="email" name="email" label="Correio eletrónico" tabindex="1"
                     auto-validate autocomplete="email" minlength="4">
        </paper-input>

        <paper-input id="new_password" name="new_password" label="Nova Senha" type="password" tabindex="2"
                     auto-validate autocomplete="password" minlength="4" autofocus>
        </paper-input>

        <paper-input id="new_password_confirmation" name="new_password_confirmation" label="Repetir nova senha" type="password" tabindex="3"
                     auto-validate autocomplete="password" minlength="4">
        </paper-input>

        <div class="buttons">
          <casper-button id="submitButton" tabindex="5" on-tap="_submitNewPassword">
            <a>Definir nova senha</a>
          </casper-button>

          <div id='redirect'>Irá ser redirecionado para a <a href="">página de login <span>(➜)</span></a></div>
        </div>

      <paper-toast id="toast" duration="2000">
        <iron-icon id="closeToast"  on-tap="_hideToast" icon="casper-icons:cancel"/></iron-icon>
      </paper-toast>
    `;
  }

  static get is () {
    return 'casper-recover-password';
  }

  static _b64EncodeUnicode (str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    function toSolidBytes(match, p1) {
      return String.fromCharCode('0x' + p1);
    }));
  }

  static get properties () {
    return {
      /** Prefix for the beanstalk tube names */
      tubePrefix: {
        type: String,
        value: 'casper'
      },
      /** Domain used by the cookie, important when using a cluster */
      cookieDomain: {
        type: String,
        value: undefined
      }
    };
  }

  static decodeUrlParams (url) {
    let regex = /[?&]([^=#]+)=([^&#]*)/g;
    let params = {};
    let match;
    while ( match = regex.exec(url) ) {
      params[match[1]] = match[2];
    }
    return params;
  }

  ready () {
    super.ready();
    this.$.new_password.addEventListener('keydown',                       e => this._onKeyDown(e));
    this.$.new_password_confirmation.addEventListener('keydown',          e => this._onKeyDown(e));
    this.$.new_password.addEventListener('focused-changed',               e => this._onFocusChange(e));
    this.$.new_password_confirmation.addEventListener('focused-changed',  e => this._onFocusChange(e));

    try {
      this.socketOptions = [
        { key: 'x_brand', value: platformConfiguration.brand },
        { key: 'x_product', value: platformConfiguration.product }
      ];
    } catch (e) {
      this.socketOptions = [];
    }
    this._resetValidation();
  }

  connectedCallback () {
    super.connectedCallback();
    this.$.toast.fitInto = this;

    try {
      // Decode URL parameters to extract the JWT
      let url_parameters = CasperRecoverPassword.decodeUrlParams(document.location.href);
      this.jwt = url_parameters.s;
      let jwt_parsed = JSON.parse(atob(url_parameters.s.split(".")[1]));
      this.cluster =  jwt_parsed.job.payload.cluster;
      this.user_email = jwt_parsed.job.payload.email;

      // Check if the JWT is still valid
      let validty = new Date(0);
      validty.setUTCSeconds(jwt_parsed.exp);

      if( validty < new Date() ) {
        this._expiredLock();          // JWT expired lock the UI
      } else {
        this._sendToRemote(false);    // JWT valid but ask the server if it's still available
      }
    } catch (e) {
      this._expiredLock();
      return;
    }
  }

  _submitNewPassword (event) {
    const new_password_test = this.$.new_password.invalid
                              || this.$.new_password.value === undefined
                              || this.$.new_password.value.length === 0;
    const new_password_confirmation_test = this.$.new_password_confirmation.invalid
                                           || this.$.new_password_confirmation.value === undefined
                                           || this.$.new_password_confirmation.value.length === 0;
    const not_match = this.$.new_password.value != this.$.new_password_confirmation.value;

    if ( new_password_test || new_password_confirmation_test || not_match ) {
      if ( not_match ) {
        this._openToast('As senhas que introduziu não coincidem');
        return;
      }

      if ( new_password_test ) {
        this.$.new_password.invalid = true;
        this.$.new_password.focus();
      }

      if ( new_password_confirmation_test ) {
        this.$.new_password_confirmation.invalid = true;
        this.$.new_password_confirmation.focus();
      }

      this.$.submitButton.submitting(false);
    } else {
      this._lockUi();
      this._sendToRemote(true);
    }
    event.preventDefault();
  }

  _sendToRemote (withPassword) {
    let extra_params = {
      jwt: this.jwt
    }
    if ( withPassword ) {
      extra_params.password_confirmation = btoa(encodeURIComponent(this.$.new_password_confirmation.value));
    }

    let xhr = new XMLHttpRequest();
    xhr.open("POST", '/jobs', true);
    xhr.setRequestHeader("Content-type",            "application/text");
    xhr.setRequestHeader("Accept",                  "application/json");
    xhr.setRequestHeader("Casper-Extra-Job-Params", CasperRecoverPassword._b64EncodeUnicode(JSON.stringify(extra_params)));

    xhr.onreadystatechange = this._handleXhrResponse.bind(this);
    xhr.send(this.jwt);
    this.$.submitButton.submitting(true);
  }

  _handleXhrResponse (event) {
    const xhr = event.srcElement;

    if ( xhr.readyState === XMLHttpRequest.DONE ) {
      let response;

      try {
        response = JSON.parse(xhr.response);
      } catch (e) {
        response.success     = false;
        response.status_code = 500;
        response.error       = 'Erro inesperado, tente mais tarde';
      }
      this.$.submitButton.progress = 100;

      switch (xhr.status) {
        case 401:
          if ( response.jwt_expired !== undefined ) {
            if ( response.jwt_expired === true ) {
              this._expiredLock();
            } else {
              this._unlockUi();
              this.$.submitButton.submitting(false);
            }
          } else {
            this._showError(response.error);
          }
          break;
        case 200:
          if ( response.success === false ) {
            this._showError('Email não encontrado.');
          } else {
            if ( response.access_token ) {
              this._showSuccess('Senha redefinida com sucesso');
              this.$.socket.saveSessionCookie(response.access_token, response.access_ttl, response.issuer_url);
              this._redirect(response.url);
            } else {
              this._showError('Erro inesperado ao redefinir senha, por favor tente de novo!');
            }
          }
          break;
        case 409:
        case 500:
        default:
          this._showError('Erro inesperado ao redefinir senha, por favor tente de novo!');
          break;
        }
    }
  }

  _redirect (url) {
    setTimeout(function(){
      window.location = url;
    }, 2000)
  }

  _openToast (message, options) {
    this.$.toast.text = message;

    if ( options !== undefined ) {
      this.$.toast.duration = 0;
    }
    this.$.toast.open();
  }

  _showSuccess (message) {
    this.$.toast.setAttribute("success", "");
    this._openToast(message);
    this._unlockUi();
  }

  _showError (message) {
    this.$.toast.removeAttribute("success");
    this.$.email.invalid = false;
    this.$.new_password.invalid = false;
    this._openToast(message);
    this._unlockUi();
  }

  _showInputError (message) {
    this._hideToast();
    this.$.email.errorMessage = message;
    this.$.new_password.errorMessage = '';
    this.$.email.invalid = true;
    this.$.new_password.invalid = true;
    this._unlockUi();
  }

  _expiredLock () {
    this._lockUi();
    this.$.toast.onclick = () => window.location = `/login?recover=${this.user_email}`;
    this.$.submitButton.style.visibility = 'hidden';
    this._openToast('O link de recuperação expirou ou já foi utilizado, clique para obter um novo!', {duration: 0});
  }

  _lockUi () {
    this._hideToast();
    this.$.email.disabled = true;
    this.$.new_password.disabled = true;
    this.$.new_password_confirmation.disabled = true;
    this.$.submitButton.submitting(true);
  }

  _unlockUi () {
    this.$.new_password.disabled = false;
    this.$.new_password_confirmation.disabled = false;
    this.$.submitButton.progress = 100;
    this.$.submitButton.submitting(false);
  }

  _hideToast () {
    this.$.toast.close();
  }

  _onKeyDown (event) {
    if ( event.keyCode === 13 ) {
      if ( this.$.new_password.focused || this.$.new_password_confirmation.focused ) {
        this.$.submitButton.click();
      }
    } else {
      this._resetValidation();
    }
  }

  _resetValidation () {
    this.$.email.invalid = false;
    this.$.new_password.invalid = false;
    this.$.new_password.errorMessage = "Senha demasiado curta";
    this.$.new_password_confirmation.errorMessage = "Senha demasiado curta";
  }

  _onFocusChange (event) {
    if ( event.detail.value && (event.target.id === 'password' || event.target.id === 'email') ) {
      this._hideToast();
    }
  }
}

window.customElements.define(CasperRecoverPassword.is, CasperRecoverPassword);
