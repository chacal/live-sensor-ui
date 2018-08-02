import React, { Component } from 'react'
import './App.css'
import Mqtt from 'mqtt'
import R from 'ramda'
import moment from 'moment'
import ClearButton from './ClearButton.js'

const MQTT_BROKERS = [{name: 'Home', url: 'ws://mqtt-home.chacal.fi:8883'}, {name: 'Freya', url: 'ws://freya-raspi.chacal.fi:8883'}]

class App extends Component {
  constructor(props) {
    super(props)
    this.state = { sensorValues: {}, mqttBroker: getInitialMqttBroker() }
    this.mqttClient = this.startMqttClient(this.state.mqttBroker.url)
  }

  render() {
    return (
      <div className="container">
        <div className="row">
          <h2>Sensors</h2>
          <select className="brokerSelect form-control input-sm" name="mqttBroker" value={this.state.mqttBroker.name} onChange={this.onMqttBrokerChanged.bind(this)}>
            { MQTT_BROKERS.map(broker => <option key={broker.url} data-url={broker.url}>{broker.name}</option>) }
          </select>
          {this.renderTemperatures(this.state.sensorValues)}
          {this.renderHumidities(this.state.sensorValues)}
          {this.renderPressures(this.state.sensorValues)}
          {this.renderTankLevels(this.state.sensorValues)}
          {this.renderCurrents(this.state.sensorValues)}
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

    const newBroker = MQTT_BROKERS.find(b => b.name === e.target.value)
    this.setState({ sensorValues: {}, mqttBroker: newBroker })
    localStorage.mqttBroker = JSON.stringify(newBroker)

    this.mqttClient = this.startMqttClient(newBroker.url)
  }

  startMqttClient(brokerUrl) {
    const mqttClient = Mqtt.connect(brokerUrl)
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
      this.setState(prevState => ({sensorValues: R.omit(key, prevState.sensorValues)}))
    } else {
      try {
        const event = JSON.parse(message)
        this.setState(prevState => ({sensorValues: R.mergeWith(R.merge, prevState.sensorValues, {[key]: event})}))
      } catch(e) {
        console.warn('Exception when handling MQTT message:', message.toString(), e)
      }
    }
  }

  renderTemperatures(sensorValues) { return this.renderBasicEvents(sensorValues, 't', fixedNumber('temperature'), 'Temperature', '°C') }
  renderHumidities(sensorValues) { return this.renderBasicEvents(sensorValues, 'h', fixedNumber('humidity'), 'Humidity', '%H') }
  renderPressures(sensorValues) { return this.renderBasicEvents(sensorValues, 'p', fixedNumber('pressure'), 'Pressure', 'mbar') }
  renderTankLevels(sensorValues) { return this.renderBasicEvents(sensorValues, 'w', fixedNumber('tankLevel'), 'Tank level', '%') }
  renderCurrents(sensorValues) { return this.renderBasicEvents(sensorValues, 'c', fixedNumber('current'), 'Current', 'A') }
  renderElectricEnergyLevels(sensorValues) { return this.renderBasicEvents(sensorValues, 'e', fixedNumber('ampHours'), 'Electric energy level', 'Ah') }
  renderLevelReports(sensorValues) { return this.renderBasicEvents(sensorValues, 'r', R.prop('level'), 'Level Report', '') }
  renderAutopilotStates(sensorValues) { return this.renderBasicEvents(sensorValues, 'b', autopilotStateExtractpr, 'Autopilot', '') }
  renderRFM69GwStats(sensorValues) { return this.renderBasicEvents(sensorValues, 's', rfm69GwStatsExtractor, 'RFM69 GW Stats', '') }
  renderPirSensors(sensorValues) { return this.renderBasicEvents(sensorValues, 'k', pirValueExtractor, 'PIR', '') }

  renderBasicEvents(sensorValues, tag, valueExtractor, headingText, unitLabel) {
    const selectedEvents = eventsByTag(sensorValues, tag)

    return selectedEvents.length > 0 ?
      <div>
        <h3>{headingText}</h3>
        <table className="table table-striped table-bordered text-right basic-event">
          <tbody>{
            selectedEvents.map(e =>
              <tr key={e.instance}>
                <td className="instance">{e.instance}</td>
                <td className="value">{valueExtractor(e) + ' ' + unitLabel}</td>
                <td className="vcc">{e.vcc ? (e.vcc / 1000).toFixed(3) + 'V' : '-'}</td>
                <td className="sampleTime">{e.previousSampleTimeMicros ? e.previousSampleTimeMicros + 'µs' : '-'}</td>
                <td className="timestamp tooltip_container">
                  {moment(e.ts).format('HH:mm:ss')}
                  {e.rssi ? <span className="tooltiptext">{`RSSI: ${e.rssi} dBm`}</span> : ''}
                </td>
                <td className="clear"><ClearButton tag={tag} instance={e.instance} mqttClient={this.mqttClient}/></td>
              </tr>)
          }</tbody>
        </table>
      </div>
      : undefined
  }
}

function eventsByTag(sensorValues, tag) {
  return R.pipe(
    R.values,
    R.filter(R.propEq('tag', tag)),
    R.sortBy(R.prop('instance'))
  )(sensorValues)
}

function fixedNumber(propName) { return event => event[propName] ? event[propName].toFixed(2) : 'N/A' }
function autopilotStateExtractpr(event) { return event.enabled ? `Engaged: ${Math.round(radsToDeg(event.course))}°M` : 'Disengaged' }
function rfm69GwStatsExtractor(event) { return event.rssi + 'dB (ACK: ' + event.ackSent + ')'}
function pirValueExtractor(event) { return event.motionDetected ? 'Triggered' : 'Not triggered'}

function getInitialMqttBroker() {
  return localStorage.mqttBroker ? JSON.parse(localStorage.mqttBroker) : MQTT_BROKERS[0]
}

function radsToDeg(radians) { return radians * 180 / Math.PI }

export default App

