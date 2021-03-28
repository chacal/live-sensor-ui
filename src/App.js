import React, { Component } from 'react'
import './App.css'
import Mqtt from 'mqtt'
import * as R from 'ramda'
import moment from 'moment'
import ClearButton from './ClearButton.js'

const MQTT_BROKERS = [
  {
    name: 'Haukkakallio',
    url: 'wss://haukkakallio.chacal.fi:9883',
    username: '',
    password: '',
  },
  {
    name: 'Freya',
    url: 'ws://freya-raspi.chacal.fi:9883',
    username: '',
    password: ''
  }]

class App extends Component {
  constructor(props) {
    super(props)
    this.state = { sensorValues: {}, brokerState: getInitialMqttBrokerState() }
    this.mqttClient = this.startMqttClient(selectedBroker(this.state))
  }

  render() {
    return (
      <div className="container">
        <div className="row justify-content-between">
          <div className="col-md-auto">
            <h3>Sensors</h3>
          </div>
          <div className="col-md-auto">
            <form className="form-inline">
              <label>Broker:
                <select className="brokerSelect form-control form-control-sm" name="mqttBroker" value={this.state.brokerState.selected} onChange={this.onMqttBrokerChanged.bind(this)}>
                  { MQTT_BROKERS.map((broker, idx) => <option key={broker.url} value={idx}>{broker.name}</option>) }
                </select>
              </label>
              <label>
                User:
                <input className="username form-control form-control-sm" name="username" value={selectedBroker(this.state).username} onChange={this.onUsernameChanged.bind(this)}/>
              </label>
              <label>
                Password:
                <input className="password form-control form-control-sm" name="password" type="password" value={selectedBroker(this.state).password} onChange={this.onPasswordChanged.bind(this)}/>
              </label>
            </form>
          </div>
        </div>
        <div className="row">
          {this.renderTemperatures(this.state.sensorValues)}
          {this.renderHumidities(this.state.sensorValues)}
          {this.renderPressures(this.state.sensorValues)}
          {this.renderTankLevels(this.state.sensorValues)}
          {this.renderCurrents(this.state.sensorValues)}
          {this.renderVoltages(this.state.sensorValues)}
          {this.renderElectricEnergyLevels(this.state.sensorValues)}
          {this.renderLevelReports(this.state.sensorValues)}
          {this.renderAutopilotStates(this.state.sensorValues)}
          {this.renderRFM69GwStats(this.state.sensorValues)}
          {this.renderPirSensors(this.state.sensorValues)}
        </div>
      </div>
    )
  }

  onMqttBrokerChanged(e) {
    this.mqttClient.end()
    const selectedBrokerIdx = e.target.value

    this.setState(prevState => {
      const newState = {
        sensorValues: {},
        brokerState: R.set(R.lensProp('selected'), selectedBrokerIdx, prevState.brokerState)
      }

      localStorage.brokerState = JSON.stringify(newState.brokerState)
      this.mqttClient = this.startMqttClient(selectedBroker(newState))

      return newState
    })
  }

  onUsernameChanged(e) {
    this.updateStateBrokerProp('username', e.target.value)
  }

  onPasswordChanged(e) {
    this.updateStateBrokerProp('password', e.target.value)
  }

  updateStateBrokerProp(propName, propValue) {
    this.setState(prevState => {
      const selIdx = prevState.brokerState.selected
      const lens = R.lensPath(['brokerState', 'brokers', selIdx, propName])
      const newState = R.set(lens, propValue, prevState)
      localStorage.brokerState = JSON.stringify(newState.brokerState)
      return newState
    })
  }

  startMqttClient(broker) {
    const mqttClient = Mqtt.connect(broker.url, R.pick(['username', 'password'], broker))
    mqttClient.on('connect', () => {
      mqttClient.subscribe('/sensor/+/+/state')
      mqttClient.on('message', this.onMqttMessage.bind(this))
    })
    return mqttClient
  }

  onMqttMessage(topic, message) {
    const [, , instance, tag,] = topic.split('/')
    const key = instance + '_' + tag

    if(message.length === 0) {
      this.setState(prevState => ({sensorValues: R.omit([key], prevState.sensorValues)}))
    } else {
      try {
        const event = JSON.parse(message)
        this.setState(prevState => ({sensorValues: R.mergeRight(prevState.sensorValues, {[key]: event})}))
      } catch(e) {
        console.warn('Exception when handling MQTT message:', message.toString(), e)
      }
    }
  }

  renderTemperatures(sensorValues) { return this.renderBasicEvents(sensorValues, ['t', 'm'], fixedNumber('temperature'), 'Temperature', '°C') }
  renderHumidities(sensorValues) { return this.renderBasicEvents(sensorValues, ['h', 'm'], fixedNumber('humidity'), 'Humidity', '%H') }
  renderPressures(sensorValues) { return this.renderBasicEvents(sensorValues, ['p', 'm'], fixedNumber('pressure'), 'Pressure', 'mbar') }
  renderTankLevels(sensorValues) { return this.renderBasicEvents(sensorValues, 'w', fixedNumber('tankLevel'), 'Tank level', '%') }
  renderCurrents(sensorValues) { return this.renderBasicEvents(sensorValues, 'c', fixedNumber('current'), 'Current', 'A') }
  renderVoltages(sensorValues) { return this.renderBasicEvents(sensorValues, 'v', vccExtractor, 'Voltage', 'V') }
  renderElectricEnergyLevels(sensorValues) { return this.renderBasicEvents(sensorValues, 'e', fixedNumber('ampHours'), 'Electric energy level', 'Ah') }
  renderLevelReports(sensorValues) { return this.renderBasicEvents(sensorValues, 'r', R.prop('level'), 'Level Report', '') }
  renderAutopilotStates(sensorValues) { return this.renderBasicEvents(sensorValues, 'b', autopilotStateExtractpr, 'Autopilot', '') }
  renderRFM69GwStats(sensorValues) { return this.renderBasicEvents(sensorValues, 's', rfm69GwStatsExtractor, 'RFM69 GW Stats', '') }
  renderPirSensors(sensorValues) { return this.renderBasicEvents(sensorValues, 'k', pirValueExtractor, 'PIR', '') }

  renderBasicEvents(sensorValues, tag, valueExtractor, headingText, unitLabel) {
    const selectedEvents = eventsByTags(sensorValues, tag)

    return selectedEvents.length > 0 ?
      <div className="col-12">
        <h4>{headingText}</h4>
        <table className="table table-striped table-bordered text-right basic-event">
          <tbody>{
            selectedEvents.map(e =>
              <tr key={e.instance}>
                <td className="instance">{e.instance}</td>
                <td className="value">{valueExtractor(e) + ' ' + unitLabel}</td>
                <td className="vcc">{vccExtractor(e) + ' V'}</td>
                <td className="rssi">{e.rssi ? e.rssi + ' dBm' : '-'}</td>
                <td className="timestamp">{moment(e.ts).format('HH:mm:ss')}</td>
                <td className="clear"><ClearButton tag={e.tag} instance={e.instance} mqttClient={this.mqttClient}/></td>
              </tr>)
          }</tbody>
        </table>
      </div>
      : undefined
  }
}

function eventsByTags(sensorValues, tags) {
  const tagsArr = Array.isArray(tags) ? tags : [tags]
  return R.pipe(
    R.values,
    R.filter(R.propSatisfies(t => tagsArr.includes(t), 'tag')),
    R.sortBy(R.prop('instance'))
  )(sensorValues)
}

function fixedNumber(propName) { return event => typeof event[propName] === 'number' ? event[propName].toFixed(2) : 'N/A' }
function autopilotStateExtractpr(event) { return event.enabled ? `Engaged: ${Math.round(radsToDeg(event.course))}°M` : 'Disengaged' }
function rfm69GwStatsExtractor(event) { return event.rssi + 'dB (ACK: ' + event.ackSent + ')'}
function pirValueExtractor(event) { return event.motionDetected ? 'Triggered' : 'Not triggered'}
function vccExtractor(event) { return event.vcc ? (event.vcc / 1000).toFixed(3) : 'N/A' }

function getInitialMqttBrokerState() {
  return localStorage.brokerState ? JSON.parse(localStorage.brokerState) : {
    brokers: MQTT_BROKERS,
    selected: 0
  }
}

function selectedBroker(state) {
  return state.brokerState.brokers[state.brokerState.selected]
}

function radsToDeg(radians) { return radians * 180 / Math.PI }

export default App

