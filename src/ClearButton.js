import React, { Component } from 'react'

class ClearButton extends Component {
  render() {
    return <button type="button" className="btn btn-default btn-xs" onClick={this.sendEmptyStateToMqttBroker.bind(this)}>Clear</button>
  }

  sendEmptyStateToMqttBroker() {
    this.props.mqttClient.publish(`/sensor/${this.props.instance}/${this.props.tag}/state`, null, {qos: 1, retain: true})
  }
}


export default ClearButton
