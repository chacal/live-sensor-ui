import React, { Component } from 'react'
import './App.css'
import Mqtt from 'mqtt'
import R from 'ramda'
import moment from 'moment'
import ClearButton from './ClearButton.js'

const MQTT_BROKERS = [{name: 'Home', url: 'ws://mqtt-home.chacal.fi:8883'}, {name: 'Freya', url: 'ws://10.90.100.1:8883'}]

class App extends Component {
  constructor(props) {
    super(props)
    this.state = { sensorValues: {}, mqttBroker: MQTT_BROKERS[0] }
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
          <h3>Temperature</h3>
          {this.renderTemperatures(this.state.sensorValues)}
          <h3>Humidity</h3>
          {this.renderHumidities(this.state.sensorValues)}
          <h3>Pressure</h3>
          {this.renderPressures(this.state.sensorValues)}
          <h3>Tank level</h3>
          {this.renderTankLevels(this.state.sensorValues)}
        </div>
      </div>
    )
  }

  onMqttBrokerChanged(e) {
    this.mqttClient.end()

    const newBroker = MQTT_BROKERS.find(b => b.name === e.target.value)
    this.setState({ sensorValues: {}, mqttBroker: newBroker })
    this.mqttClient = this.startMqttClient(newBroker.url)
  }

  startMqttClient(brokerUrl) {
    const mqttClient = Mqtt.connect(brokerUrl)
    mqttClient.on('connect', () => {
      mqttClient.subscribe('/sensor/+/+/state')
      mqttClient.on('message', (topic, message) => {
        const [, , instance, tag, ] = topic.split('/')
        const key = instance + '_' + tag

        if(message.length === 0) {
          this.setState(prevState => ({ sensorValues: R.omit(key, prevState.sensorValues) }))
        } else {
          try {
            const event = JSON.parse(message)
            this.setState(prevState => ({ sensorValues: R.mergeWith(R.merge, prevState.sensorValues, { [key]: event }) }))
          } catch (e) {
            console.warn('Exception when handling MQTT message:', message.toString(), e)
          }
        }
      })
    })
    return mqttClient
  }

  renderTemperatures(sensorValues) { return this.renderBasicEvents(sensorValues, 't', R.prop('temperature'), '°C') }
  renderHumidities(sensorValues) { return this.renderBasicEvents(sensorValues, 'h', R.prop('humidity'), '%H') }
  renderPressures(sensorValues) { return this.renderBasicEvents(sensorValues, 'p', R.prop('pressure'), 'mbar') }
  renderTankLevels(sensorValues) { return this.renderBasicEvents(sensorValues, 'w', R.prop('tankLevel'), '%') }

  renderBasicEvents(sensorValues, tag, valueExtractor, unitLabel) {
    return <table className="table table-striped table-bordered text-right basic-event">
      <tbody>{
        eventsByTag(sensorValues, tag).map(e =>
          <tr key={e.instance}>
            <td>{e.instance}</td>
            <td>{valueExtractor(e).toFixed(2) + ' ' + unitLabel}</td>
            <td>{e.vcc ? (e.vcc / 1000).toFixed(3) + 'V' : '-'}</td>
            <td>{e.previousSampleTimeMicros ? e.previousSampleTimeMicros + 'µs' : '-'}</td>
            <td>{moment(e.ts).format('HH:mm:ss')}</td>
            <td><ClearButton tag={tag} instance={e.instance} mqttClient={this.mqttClient}/></td>
          </tr>)
      }</tbody>
    </table>
  }
}

function eventsByTag(sensorValues, tag) {
  return R.pipe(
    R.values,
    R.filter(R.propEq('tag', tag)),
    R.sortBy(R.prop('instance'))
  )(sensorValues)
}

export default App

